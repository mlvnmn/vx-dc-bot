const { Events, EmbedBuilder } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const { resolveChannel } = require('../utils/channelHelper');

module.exports = {
  name: Events.MessageBulkDelete,
  async execute(messages, channel) {
    try {
      if (!channel || !channel.guild) return;
      const guild = channel.guild;

      const logChannel = resolveChannel(guild, config.channels.deletedMessageLogs, 'Deleted Message Logs');
      if (!logChannel) return;

      if (channel.id === logChannel.id) return;

      const count = messages.size;
      const now = Math.floor(Date.now() / 1000);

      const embed = new EmbedBuilder()
        .setTitle('💥 Bulk Messages Deleted')
        .setColor(config.colors.deletedMessageLog || 0xED4245)
        .setDescription(`**${count}** messages were deleted in bulk in <#${channel.id}>`)
        .addFields(
          { name: '💬 Channel', value: `<#${channel.id}> (\`#${channel.name}\`)`, inline: true },
          { name: '🔢 Messages Count', value: `\`${count}\` messages`, inline: true },
          { name: '🕒 Deleted At', value: `<t:${now}:F> (<t:${now}:R>)`, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: `Channel ID: ${channel.id}` });

      await logChannel.send({ embeds: [embed] }).catch((err) => {
        logger.error(`Failed to send Bulk Delete log in #${logChannel.name}: ${err.message}`);
      });
    } catch (err) {
      logger.error(`Error in messageDeleteBulkLog event handler: ${err.message}`);
    }
  }
};
