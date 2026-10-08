const { Events, EmbedBuilder } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const { resolveChannel } = require('../utils/channelHelper');

module.exports = {
  name: Events.UserUpdate,
  async execute(oldUser, newUser, client) {
    try {
      if (!oldUser || !newUser || newUser.bot) return;

      const avatarChanged = oldUser.displayAvatarURL() !== newUser.displayAvatarURL();
      const usernameChanged = oldUser.username !== newUser.username;
      const globalNameChanged = oldUser.globalName !== newUser.globalName;

      if (!avatarChanged && !usernameChanged && !globalNameChanged) return;

      const now = Math.floor(Date.now() / 1000);
      const userMention = `<@${newUser.id}>`;
      const oldAvatar = oldUser.displayAvatarURL({ dynamic: true, size: 256 });
      const newAvatar = newUser.displayAvatarURL({ dynamic: true, size: 256 });

      // Find all guilds where this user is present
      const guilds = client.guilds.cache.filter((g) => g.members.cache.has(newUser.id));

      for (const [, guild] of guilds) {
        const logChannel = resolveChannel(guild, config.channels.accountLogs, 'Account Logs');
        if (!logChannel) continue;

        const embed = new EmbedBuilder()
          .setThumbnail(newAvatar)
          .setTimestamp()
          .setFooter({ text: `User ID: ${newUser.id}`, iconURL: newAvatar });

        // 1. Avatar Changed
        if (avatarChanged) {
          embed
            .setTitle('🖼️ Global Avatar Changed')
            .setColor(config.colors.accountLog || 0x3498DB)
            .setDescription(`${userMention} updated their Discord account profile picture`)
            .addFields(
              { name: '👤 Member', value: `${userMention} (\`${newUser.tag}\`)`, inline: false },
              { name: '🕒 Updated At', value: `<t:${now}:F> (<t:${now}:R>)`, inline: false }
            );

          if (oldAvatar && newAvatar) {
            embed.addFields({
              name: '🖼️ Avatar Preview',
              value: `[Old Avatar](${oldAvatar}) ➔ [New Avatar](${newAvatar})`,
              inline: false
            });
          }

          await logChannel.send({ embeds: [embed] }).catch((err) => {
            logger.error(`Failed to send Avatar update log in #${logChannel.name}: ${err.message}`);
          });
        }

        // 2. Username Changed
        if (usernameChanged) {
          const uEmbed = new EmbedBuilder()
            .setTitle('🏷️ Username Changed')
            .setColor(0xF1C40F)
            .setDescription(`${userMention} changed their Discord username`)
            .addFields(
              { name: '👤 Member', value: `${userMention}`, inline: false },
              { name: '🔴 Old Username', value: `\`${oldUser.username || 'None'}\``, inline: true },
              { name: '🟢 New Username', value: `\`${newUser.username}\``, inline: true },
              { name: '🕒 Updated At', value: `<t:${now}:F>`, inline: false }
            )
            .setThumbnail(newAvatar)
            .setTimestamp()
            .setFooter({ text: `User ID: ${newUser.id}`, iconURL: newAvatar });

          await logChannel.send({ embeds: [uEmbed] }).catch(() => {});
        }

        // 3. Global Display Name Changed
        if (globalNameChanged) {
          const gEmbed = new EmbedBuilder()
            .setTitle('👤 Display Name Changed')
            .setColor(0x9B59B6)
            .setDescription(`${userMention} changed their global display name`)
            .addFields(
              { name: '👤 Member', value: `${userMention} (\`${newUser.tag}\`)`, inline: false },
              { name: '🔴 Old Display Name', value: `\`${oldUser.globalName || 'None'}\``, inline: true },
              { name: '🟢 New Display Name', value: `\`${newUser.globalName || 'None'}\``, inline: true },
              { name: '🕒 Updated At', value: `<t:${now}:F>`, inline: false }
            )
            .setThumbnail(newAvatar)
            .setTimestamp()
            .setFooter({ text: `User ID: ${newUser.id}`, iconURL: newAvatar });

          await logChannel.send({ embeds: [gEmbed] }).catch(() => {});
        }
      }
    } catch (err) {
      logger.error(`Error in accountUserLog event handler: ${err.message}`);
    }
  }
};
