const { Events, EmbedBuilder } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const { resolveChannel } = require('../utils/channelHelper');

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    try {
      if (!oldMember || !newMember || newMember.user.bot) return;

      const guild = newMember.guild;
      if (!guild) return;

      const logChannel = resolveChannel(guild, config.channels.accountLogs, 'Account Logs');
      if (!logChannel) return;

      const now = Math.floor(Date.now() / 1000);
      const userMention = `<@${newMember.id}>`;
      const avatarUrl = newMember.user.displayAvatarURL({ dynamic: true, size: 256 });

      // 1. Nickname Changed
      if (oldMember.nickname !== newMember.nickname) {
        const oldNick = oldMember.nickname || '*None (Used Username)*';
        const newNick = newMember.nickname || '*None (Reset to Username)*';

        const embed = new EmbedBuilder()
          .setTitle('✏️ Server Nickname Changed')
          .setColor(config.colors.accountLog || 0x3498DB)
          .setDescription(`${userMention}'s server nickname was updated`)
          .addFields(
            { name: '👤 Member', value: `${userMention} (\`${newMember.user.tag}\`)`, inline: false },
            { name: '🔴 Old Nickname', value: `\`${oldNick}\``, inline: true },
            { name: '🟢 New Nickname', value: `\`${newNick}\``, inline: true },
            { name: '🕒 Updated At', value: `<t:${now}:F>`, inline: false }
          )
          .setThumbnail(avatarUrl)
          .setTimestamp()
          .setFooter({ text: `User ID: ${newMember.id}`, iconURL: avatarUrl });

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }

      // 2. Server Avatar Changed
      if (oldMember.avatar !== newMember.avatar) {
        const oldGuildAvatar = oldMember.avatarURL({ dynamic: true, size: 256 });
        const newGuildAvatar = newMember.avatarURL({ dynamic: true, size: 256 });

        const embed = new EmbedBuilder()
          .setTitle('🖼️ Server Profile Picture Changed')
          .setColor(config.colors.accountLog || 0x3498DB)
          .setDescription(`${userMention} updated their server-specific profile avatar`)
          .addFields(
            { name: '👤 Member', value: `${userMention} (\`${newMember.user.tag}\`)`, inline: false },
            { name: '🕒 Updated At', value: `<t:${now}:F>`, inline: false }
          )
          .setThumbnail(newGuildAvatar || avatarUrl)
          .setTimestamp()
          .setFooter({ text: `User ID: ${newMember.id}` });

        if (oldGuildAvatar || newGuildAvatar) {
          embed.addFields({
            name: '🖼️ Avatar Links',
            value: `${oldGuildAvatar ? `[Old Server Avatar](${oldGuildAvatar})` : 'No Old Avatar'} ➔ ${newGuildAvatar ? `[New Server Avatar](${newGuildAvatar})` : 'Reset to Global Avatar'}`,
            inline: false
          });
        }

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }

      // 3. Roles Changed
      const oldRoles = oldMember.roles.cache;
      const newRoles = newMember.roles.cache;

      const addedRoles = newRoles.filter((r) => !oldRoles.has(r.id));
      const removedRoles = oldRoles.filter((r) => !newRoles.has(r.id));

      if (addedRoles.size > 0 || removedRoles.size > 0) {
        const embed = new EmbedBuilder()
          .setTitle('🛡️ Member Roles Updated')
          .setColor(0x9B59B6)
          .setDescription(`Roles for ${userMention} were updated`)
          .addFields({ name: '👤 Member', value: `${userMention} (\`${newMember.user.tag}\`)`, inline: false });

        if (addedRoles.size > 0) {
          const addedStr = addedRoles.map((r) => `<@&${r.id}>`).join(', ');
          embed.addFields({ name: '🟢 Added Roles', value: addedStr.slice(0, 1024), inline: false });
        }

        if (removedRoles.size > 0) {
          const removedStr = removedRoles.map((r) => `<@&${r.id}>`).join(', ');
          embed.addFields({ name: '🔴 Removed Roles', value: removedStr.slice(0, 1024), inline: false });
        }

        embed
          .addFields({ name: '🕒 Updated At', value: `<t:${now}:F>`, inline: false })
          .setThumbnail(avatarUrl)
          .setTimestamp()
          .setFooter({ text: `User ID: ${newMember.id}`, iconURL: avatarUrl });

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }

      // 4. Timeout / Communication Disabled Changed
      if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
        const isTimedOut = newMember.communicationDisabledUntilTimestamp && newMember.communicationDisabledUntilTimestamp > Date.now();

        const embed = new EmbedBuilder()
          .setTitle(isTimedOut ? '⏳ Member Timed Out' : '🔊 Timeout Removed')
          .setColor(isTimedOut ? 0xE74C3C : 0x2ECC71)
          .setDescription(`${userMention}'s timeout status was changed`)
          .addFields({ name: '👤 Member', value: `${userMention} (\`${newMember.user.tag}\`)`, inline: false });

        if (isTimedOut) {
          const untilUnix = Math.floor(newMember.communicationDisabledUntilTimestamp / 1000);
          embed.addFields({ name: '⏳ Timed Out Until', value: `<t:${untilUnix}:F> (<t:${untilUnix}:R>)`, inline: false });
        } else {
          embed.addFields({ name: '🔊 Status', value: 'Member is no longer timed out.', inline: false });
        }

        embed
          .setThumbnail(avatarUrl)
          .setTimestamp()
          .setFooter({ text: `User ID: ${newMember.id}`, iconURL: avatarUrl });

        await logChannel.send({ embeds: [embed] }).catch(() => {});
      }
    } catch (err) {
      logger.error(`Error in accountMemberLog event handler: ${err.message}`);
    }
  }
};
