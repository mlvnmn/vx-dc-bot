const { Events, EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');
const config = require('../config');
const { resolveVoiceChannelW, isAllowed } = require('../utils/privateVoiceHelper');
const { isTriggerChannel, createTempVoiceChannel, checkAndDeleteTempChannel } = require('../utils/tempVoiceHelper');
const { resolveChannel, normalizeChannelName } = require('../utils/channelHelper');
const { resolveRole } = require('../utils/roleHelper');
const { formatUserTag, fromSmallCaps } = require('../utils/formatters');

// Cooldown map to prevent ping spam (guildId:memberId -> timestamp)
const alertCooldowns = new Map();
const COOLDOWN_MS = 5000; // 5 seconds cooldown for responsive testing

/**
 * Helper to check if a voice channel is the Support Waiting room
 * @param {import('discord.js').VoiceChannel} channel 
 * @returns {boolean}
 */
function isSupportWaitingChannel(channel) {
  if (!channel || channel.type !== 2) return false; // 2: GuildVoice

  // 1. Check configured ID
  if (config.channels.supportWaiting?.id && channel.id === config.channels.supportWaiting.id) {
    return true;
  }

  const rawName = channel.name ? channel.name.toLowerCase().trim() : '';
  const asciiName = channel.name ? fromSmallCaps(channel.name).toLowerCase().trim() : '';
  const normName = normalizeChannelName(channel.name);

  // 2. Check configured candidate names
  if (config.channels.supportWaiting?.names) {
    for (const targetName of config.channels.supportWaiting.names) {
      if (!targetName) continue;
      const cleanTarget = targetName.toLowerCase().trim();
      const normTarget = normalizeChannelName(cleanTarget);
      if (
        rawName.includes(cleanTarget) ||
        asciiName.includes(cleanTarget) ||
        (normTarget.length > 0 && normName.includes(normTarget))
      ) {
        return true;
      }
    }
  }

  // 3. Fallback matching keywords
  return (
    rawName.includes('support waiting') ||
    asciiName.includes('support waiting') ||
    rawName.includes('support-waiting') ||
    asciiName.includes('support-waiting') ||
    normName.includes('supportwaiting') ||
    (normName.includes('support') && (normName.includes('wait') || normName.includes('waiting')))
  );
}

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    try {
      const oldChannel = oldState?.channel;
      const newChannel = newState?.channel;
      const member = newState?.member || oldState?.member;

      // 1. Handle member leaving a channel (delete temporary voice channel if empty)
      if (oldChannel && oldChannel.id !== newChannel?.id) {
        await checkAndDeleteTempChannel(oldChannel).catch(() => {});
      }

      // 2. Handle member joining or moving into a channel
      if (!newChannel || !member) return;

      const guild = newState.guild || oldState.guild;
      if (!guild) return;

      // Log voice channel transition for diagnostics
      const isSupportWaiting = isSupportWaitingChannel(newChannel);
      if (oldChannel?.id !== newChannel.id) {
        logger.info(
          `[${guild.name}] [Voice Event] ${member.user?.tag || member.id} joined VC '${newChannel.name}' (Support Waiting Match: ${isSupportWaiting})`
        );
      }

      // A. Check if joined channel is a "Create Voice" trigger channel
      if (isTriggerChannel(newChannel)) {
        await createTempVoiceChannel(member, newChannel);
        return;
      }

      // B. Check if joined channel is private voice channel 'w'
      const voiceChannelW = resolveVoiceChannelW(guild);

      if (voiceChannelW && newChannel.id === voiceChannelW.id) {
        if (!isAllowed(guild, member.id)) {
          try {
            await member.voice.setChannel(null);
            logger.warn(
              `[${guild.name}] [Private VC Security] Disconnected unauthorized user ${formatUserTag(member.user)} (ID: ${member.id}) from channel '${voiceChannelW.name}'.`
            );

            await member.send({
              content: `🔒 **Access Denied**: Voice channel **#${voiceChannelW.name}** in **${guild.name}** is strictly private. Only authorized users can enter (administrators included).`
            }).catch(() => {});
          } catch (err) {
            logger.error(`Failed to eject unauthorized member ${member.user?.tag || member.id} from private voice channel: ${err.message}`);
          }
        }
      }

      // C. Check if member joined a "Support Waiting" voice channel
      if (oldChannel?.id !== newChannel.id && isSupportWaiting) {
        const cooldownKey = `${guild.id}:${member.id}`;
        const lastAlertTime = alertCooldowns.get(cooldownKey) || 0;
        const now = Date.now();

        if (now - lastAlertTime < COOLDOWN_MS) {
          logger.info(`[${guild.name}] Suppressed duplicate Support Waiting alert for ${member.user?.tag || member.id} (cooldown active)`);
          return;
        }

        let pingChannel = resolveChannel(
          guild,
          config.channels.staffPing,
          'Staff Ping Channel'
        );

        // Fallback search across all text channels if resolveChannel failed
        if (!pingChannel) {
          pingChannel = guild.channels.cache.find((c) => {
            if (c.type !== 0 && c.type !== 5) return false; // 0: GuildText, 5: GuildAnnouncement
            const cName = c.name.toLowerCase();
            const norm = normalizeChannelName(c.name);
            const parentName = c.parent ? c.parent.name.toLowerCase() : '';
            return (
              cName.includes('ping') ||
              norm.includes('ping') ||
              (parentName.includes('staff') && (cName.includes('ping') || norm.includes('ping')))
            );
          });
        }

        if (pingChannel) {
          // Record cooldown timestamp
          alertCooldowns.set(cooldownKey, now);

          const supportRoles = [];
          // Add configured crew/staff role first if available
          const crewRole = resolveRole(guild, config.roles.crew);
          if (crewRole) {
            supportRoles.push(crewRole);
          }

          // Add standard staff/support roles present in the server
          for (const rName of [
            'Staff',
            'Tickets Support',
            'Admin',
            'Management',
            'Tickets v2',
            'Tickets Admin',
            'Support',
            'Developer',
            'Founder',
            'Core',
            'Team Magnera'
          ]) {
            const r = resolveRole(guild, { name: rName });
            if (r && !supportRoles.some((existing) => existing.id === r.id)) {
              supportRoles.push(r);
            }
          }

          const pingMention = supportRoles.length > 0 ? supportRoles.map((r) => r.toString()).join(' ') : '@here';

          const alertEmbed = new EmbedBuilder()
            .setColor(config.colors.supportWaitingAlert || 0xFEE75C)
            .setAuthor({
              name: 'Support Waiting Room Alert',
              iconURL: member.user?.displayAvatarURL({ dynamic: true })
            })
            .setTitle('⏳ Member Waiting for Assistance!')
            .setDescription(
              `Member ${member} (**${member.user?.tag || member.id}**) has joined ${newChannel} and is waiting for support!\n\n` +
              `👉 **Staff Action Required:** Please join ${newChannel} to assist them.`
            )
            .addFields(
              { name: '👤 Member', value: `${member} (\`${member.id}\`)`, inline: true },
              { name: '🔊 Channel', value: `${newChannel}`, inline: true },
              { name: '⏰ Joined At', value: `<t:${Math.floor(now / 1000)}:R>`, inline: true }
            )
            .setFooter({ text: `User ID: ${member.id}` })
            .setTimestamp();

          try {
            await pingChannel.send({ content: `🔔 ${pingMention}`, embeds: [alertEmbed] });
            logger.info(`[${guild.name}] ✅ Sent Support Waiting alert for ${member.user?.tag || member.id} in #${pingChannel.name}`);
          } catch (err) {
            logger.error(`Failed to send Support Waiting alert to #${pingChannel.name}: ${err.message}. (Ensure bot has Send Messages & View Channel permissions in #${pingChannel.name})`);
          }
        } else {
          logger.warn(`[${guild.name}] Could not send Support Waiting alert: Staff ping channel not found in server.`);
        }
      }
    } catch (err) {
      logger.error(`Error in voiceStateUpdate event handler: ${err.message}`);
    }
  }
};

