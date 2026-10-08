const { Events, EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');
const { resolveVoiceChannelW, isAllowed } = require('../utils/privateVoiceHelper');
const { isTriggerChannel, createTempVoiceChannel, checkAndDeleteTempChannel } = require('../utils/tempVoiceHelper');
const { resolveChannel } = require('../utils/channelHelper');
const { resolveRole } = require('../utils/roleHelper');
const { formatUserTag } = require('../utils/formatters');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    const oldChannel = oldState.channel;
    const newChannel = newState.channel;
    const member = newState.member || oldState.member;

    // 1. Handle member leaving a channel (delete temporary voice channel if empty)
    if (oldChannel && oldChannel.id !== newChannel?.id) {
      await checkAndDeleteTempChannel(oldChannel);
    }

    // 2. Handle member joining or moving into a channel
    if (!newChannel || !member) return;

    // A. Check if joined channel is a "Create Voice" trigger channel
    if (isTriggerChannel(newChannel)) {
      await createTempVoiceChannel(member, newChannel);
      return;
    }

    // B. Check if joined channel is private voice channel 'w'
    const guild = newState.guild;
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
          logger.error(`Failed to eject unauthorized member ${member.user.tag} from private voice channel: ${err.message}`);
        }
      }
    }

    // C. Check if joined channel is "Support Waiting" room
    if (oldChannel?.id !== newChannel.id && newChannel.name.toLowerCase().includes('support waiting')) {
      const pingChannel = resolveChannel(
        guild,
        { names: ['ping', 'pings', 'staff-ping', 'support-ping', 'ping-logs'] },
        'Ping Channel'
      );

      if (pingChannel) {
        const supportRoles = [];
        for (const rName of ['Staff', 'Tickets Support', 'Admin', 'Management', 'Tickets v2', 'Tickets Admin']) {
          const r = resolveRole(guild, { name: rName });
          if (r) supportRoles.push(r);
        }

        const pingMention = supportRoles.length > 0 ? supportRoles.map((r) => r.toString()).join(' ') : '@here';

        const alertEmbed = new EmbedBuilder()
          .setColor(0xFEE75C)
          .setAuthor({
            name: 'Support Waiting Room Alert',
            iconURL: member.user.displayAvatarURL({ dynamic: true })
          })
          .setTitle('⏳ Member Waiting for Assistance!')
          .setDescription(
            `Member ${member} (**${member.user.tag}**) has joined ${newChannel} and is waiting for support!\n\n` +
            `👉 **Staff Action Required:** Please join ${newChannel} to assist them.`
          )
          .setFooter({ text: `User ID: ${member.id}` })
          .setTimestamp();

        try {
          await pingChannel.send({ content: `🔔 ${pingMention}`, embeds: [alertEmbed] });
          logger.info(`[${guild.name}] Sent Support Waiting alert for ${member.user.tag} in #${pingChannel.name}`);
        } catch (err) {
          logger.error(`Failed to send Support Waiting alert to #${pingChannel.name}: ${err.message}`);
        }
      }
    }
  }
};
