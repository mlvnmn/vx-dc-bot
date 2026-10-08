const { Events, EmbedBuilder } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const { resolveChannel } = require('../utils/channelHelper');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    try {
      const guild = newState.guild || oldState.guild;
      if (!guild) return;

      const oldChannel = oldState.channel;
      const newChannel = newState.channel;

      // Only trigger if channel actually changed
      if (oldChannel?.id === newChannel?.id) return;

      const member = newState.member || oldState.member;
      if (!member || member.user.bot) return;

      const logChannel = resolveChannel(guild, config.channels.voiceLogs, 'Voice Logs');
      if (!logChannel) return;

      const now = Math.floor(Date.now() / 1000);
      const userTag = member.user.tag;
      const userMention = `<@${member.id}>`;
      const avatarUrl = member.user.displayAvatarURL({ dynamic: true, size: 256 });

      const embed = new EmbedBuilder()
        .setThumbnail(avatarUrl)
        .setTimestamp()
        .setFooter({ text: `User ID: ${member.id}`, iconURL: avatarUrl });

      // 1. User Joined Voice Channel
      if (!oldChannel && newChannel) {
        embed
          .setTitle('🔊 Voice Channel Joined')
          .setColor(config.colors.voiceLog || 0x2ECC71)
          .setDescription(`${userMention} joined voice channel **#${newChannel.name}**`)
          .addFields(
            { name: '👤 Member', value: `${userMention} (\`${userTag}\`)`, inline: true },
            { name: '🔊 Channel', value: `<#${newChannel.id}> (\`${newChannel.name}\`)`, inline: true },
            { name: '🕒 Joined At', value: `<t:${now}:F> (<t:${now}:R>)`, inline: false }
          );

        await logChannel.send({ embeds: [embed] }).catch((err) => {
          logger.error(`Failed to send Voice Join log in #${logChannel.name}: ${err.message}`);
        });
      }
      // 2. User Left Voice Channel
      else if (oldChannel && !newChannel) {
        embed
          .setTitle('🔇 Voice Channel Left')
          .setColor(config.colors.exitLog || 0xE74C3C)
          .setDescription(`${userMention} left voice channel **#${oldChannel.name}**`)
          .addFields(
            { name: '👤 Member', value: `${userMention} (\`${userTag}\`)`, inline: true },
            { name: '🔊 Channel', value: `<#${oldChannel.id}> (\`${oldChannel.name}\`)`, inline: true },
            { name: '🕒 Left At', value: `<t:${now}:F> (<t:${now}:R>)`, inline: false }
          );

        await logChannel.send({ embeds: [embed] }).catch((err) => {
          logger.error(`Failed to send Voice Leave log in #${logChannel.name}: ${err.message}`);
        });
      }
      // 3. User Switched Voice Channels
      else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
        embed
          .setTitle('🔄 Voice Channel Switched')
          .setColor(config.colors.inviteTracker || 0x3498DB)
          .setDescription(`${userMention} moved from **#${oldChannel.name}** to **#${newChannel.name}**`)
          .addFields(
            { name: '👤 Member', value: `${userMention} (\`${userTag}\`)`, inline: false },
            { name: '🔴 From Channel', value: `<#${oldChannel.id}> (\`${oldChannel.name}\`)`, inline: true },
            { name: '🟢 To Channel', value: `<#${newChannel.id}> (\`${newChannel.name}\`)`, inline: true },
            { name: '🕒 Switched At', value: `<t:${now}:F> (<t:${now}:R>)`, inline: false }
          );

        await logChannel.send({ embeds: [embed] }).catch((err) => {
          logger.error(`Failed to send Voice Switch log in #${logChannel.name}: ${err.message}`);
        });
      }
    } catch (err) {
      logger.error(`Error in voiceLog event handler: ${err.message}`);
    }
  }
};
