const fs = require('fs');
const path = require('path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const logger = require('./logger');
const { toSmallCaps } = require('./formatters');

const dataDir = path.join(__dirname, '..', 'data');
const dataFilePath = path.join(dataDir, 'privateVoiceData.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (err) {
    logger.error(`Failed to create data directory: ${err.message}`);
  }
}

/**
 * Structure of data:
 * {
 *   [guildId]: {
 *     ownerId: string|null,
 *     allowedUsers: string[] // Array of user IDs
 *   }
 * }
 */
function loadData() {
  try {
    if (fs.existsSync(dataFilePath)) {
      const raw = fs.readFileSync(dataFilePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    logger.error(`Failed to load privateVoiceData.json: ${err.message}`);
  }
  return {};
}

function saveData(data) {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    logger.error(`Failed to save privateVoiceData.json: ${err.message}`);
  }
}

/**
 * Finds the private voice channel named 'w' or 'ᴡ' in a guild
 * @param {import('discord.js').Guild} guild 
 * @returns {import('discord.js').VoiceChannel|null}
 */
function resolveVoiceChannelW(guild) {
  if (!guild || !guild.channels) return null;

  const targetNames = ['w', toSmallCaps('w')];

  return guild.channels.cache.find((c) => {
    if (c.type !== ChannelType.GuildVoice) return false;
    const cleanName = c.name.toLowerCase().trim();
    return targetNames.some((t) => t.toLowerCase() === cleanName || c.name.includes(t));
  }) || null;
}

/**
 * Get or initialize guild private voice config
 */
function getGuildData(guildId) {
  const data = loadData();
  if (!data[guildId]) {
    data[guildId] = {
      ownerId: null,
      allowedUsers: []
    };
  }
  return data[guildId];
}

/**
 * Set channel owner
 */
function setOwner(guildId, userId) {
  const data = loadData();
  if (!data[guildId]) {
    data[guildId] = { ownerId: null, allowedUsers: [] };
  }
  data[guildId].ownerId = userId;
  if (!data[guildId].allowedUsers.includes(userId)) {
    data[guildId].allowedUsers.push(userId);
  }
  saveData(data);
}

/**
 * Check if a user is allowed to access private voice channel 'w'
 */
function isAllowed(guild, userId) {
  if (!guild) return false;

  // Bot itself is always allowed
  if (userId === guild.client.user.id) return true;

  // Server Owner is allowed by default if no explicit owner is set, but ownerId takes priority
  const guildData = getGuildData(guild.id);

  // If no owner is set yet, server owner or member who first registered is allowed
  if (guildData.ownerId === userId) return true;
  if (!guildData.ownerId && userId === guild.ownerId) return true;

  return (guildData.allowedUsers || []).includes(userId);
}

/**
 * Add an allowed user
 */
function addAllowedUser(guildId, userId) {
  const data = loadData();
  if (!data[guildId]) {
    data[guildId] = { ownerId: null, allowedUsers: [] };
  }
  if (!data[guildId].allowedUsers.includes(userId)) {
    data[guildId].allowedUsers.push(userId);
    saveData(data);
    return true;
  }
  return false;
}

/**
 * Remove an allowed user
 */
function removeAllowedUser(guildId, userId) {
  const data = loadData();
  if (!data[guildId] || !data[guildId].allowedUsers) return false;

  const index = data[guildId].allowedUsers.indexOf(userId);
  if (index !== -1) {
    data[guildId].allowedUsers.splice(index, 1);
    saveData(data);
    return true;
  }
  return false;
}

/**
 * Get all allowed users for a guild
 */
function getAllowedUsers(guildId) {
  const data = getGuildData(guildId);
  return {
    ownerId: data.ownerId,
    allowedUsers: data.allowedUsers || []
  };
}

/**
 * Sync Discord channel permission overwrites for channel 'w'
 */
async function syncChannelPermissions(guild) {
  const voiceChannel = resolveVoiceChannelW(guild);
  if (!voiceChannel) return false;

  const { ownerId, allowedUsers } = getAllowedUsers(guild.id);

  try {
    // 1. Deny Connect to @everyone
    await voiceChannel.permissionOverwrites.edit(guild.roles.everyone, {
      [PermissionFlagsBits.Connect]: false
    });

    // 2. Allow Bot
    const botMember = guild.members.me;
    if (botMember) {
      await voiceChannel.permissionOverwrites.edit(botMember, {
        [PermissionFlagsBits.ViewChannel]: true,
        [PermissionFlagsBits.Connect]: true,
        [PermissionFlagsBits.MoveMembers]: true,
        [PermissionFlagsBits.ManageChannels]: true
      });
    }

    // 3. Allow Owner
    if (ownerId) {
      const ownerMember = await guild.members.fetch(ownerId).catch(() => null);
      if (ownerMember) {
        await voiceChannel.permissionOverwrites.edit(ownerMember, {
          [PermissionFlagsBits.ViewChannel]: true,
          [PermissionFlagsBits.Connect]: true,
          [PermissionFlagsBits.Speak]: true
        });
      }
    }

    // 4. Allow explicitly added users
    for (const userId of allowedUsers) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        await voiceChannel.permissionOverwrites.edit(member, {
          [PermissionFlagsBits.ViewChannel]: true,
          [PermissionFlagsBits.Connect]: true,
          [PermissionFlagsBits.Speak]: true
        });
      }
    }

    logger.info(`[${guild.name}] Synced permissions for private voice channel '${voiceChannel.name}'`);
    return true;
  } catch (err) {
    logger.error(`[${guild.name}] Error syncing private VC permissions: ${err.message}`);
    return false;
  }
}

module.exports = {
  resolveVoiceChannelW,
  setOwner,
  isAllowed,
  addAllowedUser,
  removeAllowedUser,
  getAllowedUsers,
  syncChannelPermissions
};
