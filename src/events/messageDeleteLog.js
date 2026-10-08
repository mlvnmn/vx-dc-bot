const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const { resolveChannel } = require('../utils/channelHelper');

module.exports = {
  name: Events.MessageDelete,
  async execute(message) {
    try {
      if (!message) return;

      // Try fetching partial message if content/author is missing
      if (message.partial) {
        try {
          message = await message.fetch();
        } catch (_) {
          // If fetching fails, we proceed with whatever partial data we have
        }
      }

      const guild = message.guild;
      if (!guild) return;

      // Don't log if author was a bot
      if (message.author?.bot) return;

      const logChannel = resolveChannel(guild, config.channels.deletedMessageLogs, 'Deleted Message Logs');
      if (!logChannel) return;

      // Avoid infinite loops if message was deleted inside the log channel itself
      if (message.channel?.id === logChannel.id) return;

      const author = message.author;
      const channel = message.channel;
      const now = Math.floor(Date.now() / 1000);

      const authorMention = author ? `<@${author.id}>` : 'Unknown Author';
      const authorTag = author ? author.tag : 'Unknown#0000';
      const avatarUrl = author ? author.displayAvatarURL({ dynamic: true, size: 256 }) : guild.iconURL({ dynamic: true });

      // Try fetching Audit Logs to see who deleted the message
      let deletedBy = null;
      try {
        const auditLogs = await guild.fetchAuditLogs({
          type: AuditLogEvent.MessageDelete,
          limit: 1
        }).catch(() => null);

        if (auditLogs) {
          const entry = auditLogs.entries.first();
          if (
            entry &&
            entry.target?.id === author?.id &&
            entry.extra?.channel?.id === channel?.id &&
            Date.now() - entry.createdTimestamp < 5000
          ) {
            deletedBy = entry.executor;
          }
        }
      } catch (_) {}

      // Format content safely
      let contentText = message.content ? message.content.trim() : '';
      if (contentText.length > 1024) {
        contentText = contentText.slice(0, 1020) + '...';
      }
      if (!contentText) {
        contentText = '*No text content (embed or attachment only)*';
      }

      // Check attachments
      let attachmentsList = [];
      if (message.attachments && message.attachments.size > 0) {
        attachmentsList = message.attachments.map((att) => `📄 [${att.name || 'Attachment'}](${att.url})`);
      }

      const embed = new EmbedBuilder()
        .setTitle('🗑️ Message Deleted')
        .setColor(config.colors.deletedMessageLog || 0xED4245)
        .setDescription(`A message sent by ${authorMention} was deleted in <#${channel.id}>`)
        .addFields(
          { name: '👤 Author', value: `${authorMention} (\`${authorTag}\`)`, inline: true },
          { name: '💬 Channel', value: `<#${channel.id}> (\`#${channel.name}\`)`, inline: true }
        );

      if (deletedBy && deletedBy.id !== author?.id) {
        embed.addFields({ name: '🔍 Deleted By', value: `<@${deletedBy.id}> (\`${deletedBy.tag}\`)`, inline: true });
      }

      embed.addFields({ name: '📝 Message Content', value: contentText, inline: false });

      if (attachmentsList.length > 0) {
        embed.addFields({
          name: `📎 Attachments (${attachmentsList.length})`,
          value: attachmentsList.join('\n').slice(0, 1024),
          inline: false
        });
      }

      if (message.createdTimestamp) {
        const sentTimestamp = Math.floor(message.createdTimestamp / 1000);
        embed.addFields({ name: '🕒 Sent At', value: `<t:${sentTimestamp}:F> (<t:${sentTimestamp}:R>)`, inline: true });
      }

      embed.addFields({ name: '🕒 Deleted At', value: `<t:${now}:F> (<t:${now}:R>)`, inline: true });

      embed
        .setThumbnail(avatarUrl)
        .setTimestamp()
        .setFooter({ text: `Author ID: ${author?.id || 'Unknown'} | Message ID: ${message.id}`, iconURL: avatarUrl });

      await logChannel.send({ embeds: [embed] }).catch((err) => {
        logger.error(`Failed to send Deleted Message log in #${logChannel.name}: ${err.message}`);
      });
    } catch (err) {
      logger.error(`Error in messageDeleteLog event handler: ${err.message}`);
    }
  }
};
