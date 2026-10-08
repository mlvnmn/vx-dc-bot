const fs = require('fs');
const path = require('path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const logger = require('./logger');
const { toSmallCaps } = require('./formatters');

const dataDir = path.join(__dirname, '..', 'data');
const dataFilePath = path.join(dataDir, 'tempVoiceData.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (err) {
    logger.error(`Failed to create data directory for temp voice channels: ${err.message}`);
  }
}

/**
 * Load tracked temporary channel IDs from JSON file
 * @returns {Set<string>}
 */
function loadTempChannels() {
  try {
    if (fs.existsSync(dataFilePath)) {
      const raw = fs.readFileSync(dataFilePath, 'utf8');
      const ids = JSON.parse(raw);
      if (Array.isArray(ids)) {
        return new Set(ids);
      }
    }
  } catch (err) {
    logger.error(`Failed to load tempVoiceData.json: ${err.message}`);
  }
  return new Set();
}

/**
 * Save tracked temporary channel IDs to JSON file
 * @param {Set<string>} set 
 */
function saveTempChannels(set) {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(Array.from(set), null, 2), 'utf8');
  } catch (err) {
    logger.error(`Failed to save tempVoiceData.json: ${err.message}`);
  }
}

// Set to track created temporary channel IDs in memory & disk
const tempChannels = loadTempChannels();

/**
 * Check if a voice channel is a trigger channel for creating temporary voice channels.
 * @param {import('discord.js').VoiceChannel} channel 
 * @returns {boolean}
 */
function isTriggerChannel(channel) {
  if (!channel || channel.type !== ChannelType.GuildVoice) return false;

  // 1. Check configured ID
  if (config.channels.createVoice?.id && channel.id === config.channels.createVoice.id) {
    return true;
  }

  const cleanName = channel.name.toLowerCase().trim();

  // 2. Check configured names
  if (config.channels.createVoice?.names) {
    const isConfiguredMatch = config.channels.createVoice.names.some(
      (name) => cleanName === name.toLowerCase().trim() || cleanName.includes(name.toLowerCase().trim())
    );
    if (isConfiguredMatch) return true;
  }

  // 3. Check general pattern keywords (e.g. "create voice", "join to create", "create vc")
  return (
    cleanName.includes('create voice') ||
    cleanName.includes('create-voice') ||
    cleanName.includes('join to create') ||
    cleanName.includes('create vc') ||
    cleanName.includes('ᴄʀᴇᴀᴛᴇ ᴠᴏɪᴄᴇ') ||
    cleanName.startsWith('➕')
  );
}

/**
 * Check if a voice channel is a bot-created temporary channel.
 * @param {import('discord.js').VoiceChannel} channel 
 * @returns {boolean}
 */
function isTempChannel(channel) {
  if (!channel || channel.type !== ChannelType.GuildVoice) return false;

  // Never treat trigger channels as temporary channels
  if (isTriggerChannel(channel)) return false;

  // 1. Primary check: Channel ID was tracked when created by the bot
  if (tempChannels.has(channel.id)) return true;

  // 2. Strict Fallback: Only match if channel name strictly follows possessive user format ('s voice / 's room / 's vc)
  // AND has specific member permission overwrites with ManageChannels.
  // This prevents permanent channels like "VX VOICE 1" or "VX VOICE 2" from ever being deleted!
  const cleanName = channel.name.toLowerCase().trim();
  const isPossessivePattern =
    cleanName.includes("'s voice") ||
    cleanName.includes("'s ᴠᴏɪᴄᴇ") ||
    cleanName.includes("’s voice") ||
    cleanName.includes("’s ᴠᴏɪᴄᴇ") ||
    cleanName.includes("'s room") ||
    cleanName.includes("'s ʀᴏᴏᴍ") ||
    cleanName.includes("’s room") ||
    cleanName.includes("’s ʀᴏᴏᴍ") ||
    cleanName.includes("'s vc") ||
    cleanName.includes("'s ᴠᴄ") ||
    cleanName.includes("’s vc") ||
    cleanName.includes("’s ᴠᴄ");

  if (!isPossessivePattern) return false;

  // Verify channel has non-everyone permission overwrite with ManageChannels
  const hasUserManagePerm = channel.permissionOverwrites?.cache?.some((overwrite) => {
    if (overwrite.id === channel.guild.roles.everyone.id) return false;
    if (channel.guild.members.me && overwrite.id === channel.guild.members.me.id) return false;
    return overwrite.allow.has(PermissionFlagsBits.ManageChannels);
  }) || false;

  return hasUserManagePerm;
}

/**
 * Handle user joining a trigger channel to spawn a temporary voice channel.
 * @param {import('discord.js').GuildMember} member 
 * @param {import('discord.js').VoiceChannel} triggerChannel 
 */
async function createTempVoiceChannel(member, triggerChannel) {
  if (!member || !triggerChannel) return;

  const { guild } = triggerChannel;
  // Apply Small Caps font to voice channel name to match server aesthetic
  const roomName = `🔊 ${toSmallCaps(`${member.displayName}'s Voice`)}`;

  try {
    const botMember = guild.members.me;

    // Create the temporary voice channel in the same category as the trigger channel
    const tempChannel = await guild.channels.create({
      name: roomName,
      type: ChannelType.GuildVoice,
      parent: triggerChannel.parentId || undefined,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.MuteMembers,
            PermissionFlagsBits.DeafenMembers
          ]
        },
        ...(botMember
          ? [
              {
                id: botMember.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.Connect,
                  PermissionFlagsBits.ManageChannels,
                  PermissionFlagsBits.MoveMembers
                ]
              }
            ]
          : [])
      ],
      reason: `Join-to-Create voice channel for ${member.user.tag}`
    });

    tempChannels.add(tempChannel.id);
    saveTempChannels(tempChannels);
    logger.info(`[${guild.name}] Created temporary voice channel "${tempChannel.name}" for ${member.user.tag}`);

    // Move user into newly created channel
    if (member.voice.channelId) {
      await member.voice.setChannel(tempChannel).catch((err) => {
        logger.warn(`[${guild.name}] Could not move ${member.user.tag} to new temp VC: ${err.message}`);
      });
    }

    return tempChannel;
  } catch (err) {
    logger.error(`[${guild.name}] Failed to create temporary voice channel: ${err.message}`);
    return null;
  }
}

/**
 * Handle channel deletion when empty.
 * @param {import('discord.js').VoiceChannel} channel 
 */
async function checkAndDeleteTempChannel(channel) {
  if (!channel || channel.type !== ChannelType.GuildVoice) return;

  // Never delete trigger channels!
  if (isTriggerChannel(channel)) return;

  // Check if it's actually a temporary channel before scheduling deletion
  if (!isTempChannel(channel)) return;

  // Wait 1 second for voice state updates to resolve before checking if empty
  setTimeout(async () => {
    try {
      const fetched = channel.guild.channels.cache.get(channel.id);
      if (fetched && isTempChannel(fetched) && fetched.members.size === 0) {
        await fetched.delete('Temporary voice channel empty').catch(() => {});
        tempChannels.delete(fetched.id);
        saveTempChannels(tempChannels);
        logger.info(`[${channel.guild.name}] Deleted empty temporary voice channel "${fetched.name}"`);
      }
    } catch (err) {
      logger.error(`[${channel.guild.name}] Failed to delete empty temp VC "${channel.name}": ${err.message}`);
    }
  }, 1000);
}

module.exports = {
  isTriggerChannel,
  isTempChannel,
  createTempVoiceChannel,
  checkAndDeleteTempChannel
};
