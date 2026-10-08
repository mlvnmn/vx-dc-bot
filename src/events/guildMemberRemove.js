const { Events, EmbedBuilder } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const { resolveChannel } = require('../utils/channelHelper');
const { formatUserTag, formatDuration, toSmallCaps } = require('../utils/formatters');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    const { guild, user } = member;
    const memberCount = guild.memberCount;
    const userAvatar = user.displayAvatarURL({ dynamic: true, size: 256 });

    logger.info(`[${guild.name}] Member left/removed: ${formatUserTag(user)} (ID: ${user.id}). Remaining: ${memberCount}`);

    try {
      const exitLogChannel = resolveChannel(guild, config.channels.exitLogs, 'Exit Logs');
      if (!exitLogChannel) {
        return;
      }

      // Calculate time spent on server if joinedTimestamp is available
      let timeSpentField = 'Unknown (Joined date not cached)';
      let joinedDateFormatted = null;

      if (member.joinedTimestamp) {
        const timeElapsedMs = Date.now() - member.joinedTimestamp;
        const joinedSeconds = Math.floor(member.joinedTimestamp / 1000);
        const durationText = formatDuration(timeElapsedMs);
        timeSpentField = `**${durationText}**\nJoined: <t:${joinedSeconds}:F> (<t:${joinedSeconds}:R>)`;
      }

      const exitLogEmbed = new EmbedBuilder()
        .setColor(config.colors.exitLog) // Red accent color
        .setAuthor({
          name: `${formatUserTag(user)} (${toSmallCaps('Member Left')})`,
          iconURL: userAvatar
        })
        .setDescription(`📤 **${toSmallCaps('A member has left the server')}**`)
        .addFields(
          {
            name: toSmallCaps('User'),
            value: `${user} (\`${formatUserTag(user)}\`)`,
            inline: true
          },
          {
            name: toSmallCaps('User ID'),
            value: `\`${user.id}\``,
            inline: true
          },
          {
            name: toSmallCaps('Time Spent on Server'),
            value: timeSpentField,
            inline: false
          },
          {
            name: toSmallCaps('Remaining Member Count'),
            value: `\`${memberCount}\` members`,
            inline: true
          }
        )
        .setThumbnail(userAvatar)
        .setFooter({
          text: `ID: ${user.id}`
        })
        .setTimestamp();

      await exitLogChannel.send({ embeds: [exitLogEmbed] });
      logger.success(`[${guild.name}] Sent exit audit log for ${user.tag} in #${exitLogChannel.name}`);
    } catch (err) {
      logger.error(`[${guild.name}] Failed to send exit log for ${user.tag}: ${err.message}`);
    }
  }
};
