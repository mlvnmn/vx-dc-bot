const { Events, EmbedBuilder } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const { resolveChannel } = require('../utils/channelHelper');
const { resolveRole, safelyAddRole } = require('../utils/roleHelper');
const { formatUserTag, getOrdinal, toSmallCaps } = require('../utils/formatters');
const { findUsedInvite } = require('../utils/inviteTracker');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const { guild, user } = member;
    const memberCount = guild.memberCount;
    const userAvatar = user.displayAvatarURL({ dynamic: true, size: 256 });
    const guildIcon = guild.iconURL({ dynamic: true, size: 128 });

    logger.info(`[${guild.name}] New member joined: ${formatUserTag(user)} (ID: ${user.id}). Total: ${memberCount}`);

    // Resolve which invite was used for this member
    const inviteData = await findUsedInvite(guild);

    // ==========================================
    // 1. Auto-assign "Visitor" Role
    // ==========================================
    let visitorRoleAssigned = false;
    try {
      const visitorRole = resolveRole(guild, config.roles.visitor);
      if (visitorRole) {
        visitorRoleAssigned = await safelyAddRole(member, visitorRole);
      } else {
        logger.warn(`[${guild.name}] "Visitor" role not found! Please create a role named "${config.roles.visitor.name}".`);
      }
    } catch (err) {
      logger.error(`[${guild.name}] Error auto-assigning Visitor role: ${err.message}`);
    }

    // ==========================================
    // 2. Invisible Ping in #roles Channel
    // ==========================================
    try {
      const rolesChannel = resolveChannel(guild, config.channels.roles, 'Roles Channel');
      if (rolesChannel) {
        const pingMsg = await rolesChannel.send({ content: `${member}` });
        setTimeout(() => {
          pingMsg.delete().catch(() => {});
        }, 1000);
      }
    } catch (err) {
      logger.warn(`[${guild.name}] Failed to send ghost ping in roles channel: ${err.message}`);
    }

    // ==========================================
    // 3. Send Public Welcome Card to #welcome
    // ==========================================
    try {
      const welcomeChannel = resolveChannel(guild, config.channels.welcome, 'Welcome');
      if (welcomeChannel) {
        const rolesChannel = resolveChannel(guild, config.channels.roles, 'Roles Channel');
        const rolesMention = rolesChannel ? `${rolesChannel}` : '`#roles`';

        const welcomeEmbed = new EmbedBuilder()
          .setColor(config.colors.welcome) // Vibrant Blurple / Blue
          .setAuthor({
            name: `${toSmallCaps('Welcome to')} ${config.serverName}!`,
            iconURL: guildIcon || userAvatar
          })
          .setTitle(`🎉 ${toSmallCaps('Welcome')} ${user.username}!`)
          .setDescription(
            `Hey ${member}, welcome to the official **${config.serverName}** server! 🚀\n\n` +
            `• You have automatically received the **${config.roles.visitor.name}** role.\n` +
            `• Head over to ${rolesMention} if you would like to apply for the **${config.roles.crew.name}** role!\n` +
            `• Feel free to check out the server and say hi!`
          )
          .addFields(
            {
              name: `👤 ${toSmallCaps('Member')}`,
              value: `${member} (\`${formatUserTag(user)}\`)`,
              inline: true
            },
            {
              name: `🔢 ${toSmallCaps('Member Position')}`,
              value: `**${getOrdinal(memberCount)}** ${toSmallCaps('member')}`,
              inline: true
            },
            {
              name: `🌐 ${toSmallCaps('Current Role')}`,
              value: `\`@${config.roles.visitor.name}\``,
              inline: true
            }
          )
          .setThumbnail(userAvatar)
          .setFooter({
            text: `${config.serverName} • ${toSmallCaps('Member')} #${memberCount}`,
            iconURL: guildIcon || undefined
          })
          .setTimestamp();

        await welcomeChannel.send({
          content: `${toSmallCaps('Welcome to')} ${config.serverName}, ${member}! 👋`,
          embeds: [welcomeEmbed]
        });
        logger.success(`[${guild.name}] Sent welcome message for ${user.tag} in #${welcomeChannel.name}`);
      }
    } catch (err) {
      logger.error(`[${guild.name}] Failed to send welcome message for ${user.tag}: ${err.message}`);
    }

    // ==========================================
    // 4. Send Audit Join Log Embed to #join-logs
    // ==========================================
    try {
      const joinLogChannel = resolveChannel(guild, config.channels.joinLogs, 'Join Logs');
      if (joinLogChannel) {
        const createdTimestamp = Math.floor(user.createdTimestamp / 1000);
        const joinLogEmbed = new EmbedBuilder()
          .setColor(config.colors.joinLog) // Green accent color
          .setAuthor({
            name: `${formatUserTag(user)} (${toSmallCaps('Member Joined')})`,
            iconURL: userAvatar
          })
          .setDescription(`📥 **${toSmallCaps('New member joined the server')}**`)
          .addFields(
            {
              name: toSmallCaps('User'),
              value: `${member} (\`${formatUserTag(user)}\`)`,
              inline: true
            },
            {
              name: toSmallCaps('User ID'),
              value: `\`${user.id}\``,
              inline: true
            },
            {
              name: toSmallCaps('Auto-Role'),
              value: visitorRoleAssigned ? `✅ Assigned \`${config.roles.visitor.name}\`` : `⚠️ Not assigned`,
              inline: true
            },
            {
              name: toSmallCaps('Invited By'),
              value: inviteData.inviter ? `${inviteData.inviter} (\`${inviteData.inviterTag}\`)` : `\`${inviteData.inviterTag}\``,
              inline: true
            },
            {
              name: toSmallCaps('Account Created'),
              value: `<t:${createdTimestamp}:F>\n(<t:${createdTimestamp}:R>)`,
              inline: false
            },
            {
              name: toSmallCaps('Server Member Count'),
              value: `\`${memberCount}\` members`,
              inline: true
            }
          )
          .setThumbnail(userAvatar)
          .setFooter({
            text: `ID: ${user.id}`
          })
          .setTimestamp();

        await joinLogChannel.send({ embeds: [joinLogEmbed] });
        logger.success(`[${guild.name}] Sent join audit log for ${user.tag} in #${joinLogChannel.name}`);
      }
    } catch (err) {
      logger.error(`[${guild.name}] Failed to send join log for ${user.tag}: ${err.message}`);
    }

    // ==========================================
    // 5. Send Dedicated Invite Log to #invite-tracker
    // ==========================================
    try {
      const inviteTrackerChannel = resolveChannel(guild, config.channels.inviteTracker, 'Invite Tracker');
      if (inviteTrackerChannel) {
        const createdTimestamp = Math.floor(user.createdTimestamp / 1000);
        const inviterText = inviteData.inviter
          ? `${inviteData.inviter} (\`${inviteData.inviterTag}\`)`
          : `\`${inviteData.inviterTag}\``;

        const inviteTrackerEmbed = new EmbedBuilder()
          .setColor(config.colors.inviteTracker)
          .setAuthor({
            name: `${formatUserTag(user)} • ${toSmallCaps('Member Joined')}`,
            iconURL: userAvatar
          })
          .setTitle(`📩 ${toSmallCaps('Invite Tracked')}`)
          .setThumbnail(userAvatar)
          .addFields(
            {
              name: `👤 ${toSmallCaps('Member')}`,
              value: `${member} (\`${formatUserTag(user)}\`)`,
              inline: true
            },
            {
              name: `✉️ ${toSmallCaps('Invited By')}`,
              value: inviterText,
              inline: true
            },
            {
              name: `🔑 ${toSmallCaps('Invite Code')}`,
              value: `\`${inviteData.code}\``,
              inline: true
            },
            {
              name: `📊 ${toSmallCaps('Inviter Total')}`,
              value: inviteData.inviter ? `**${inviteData.totalInviterUses}** invite(s)` : 'N/A',
              inline: true
            },
            {
              name: `🔢 ${toSmallCaps('Member Position')}`,
              value: `**${getOrdinal(memberCount)}** member`,
              inline: true
            },
            {
              name: `📅 ${toSmallCaps('Account Age')}`,
              value: `<t:${createdTimestamp}:R>`,
              inline: true
            }
          )
          .setFooter({
            text: `${config.serverName} • User ID: ${user.id}`,
            iconURL: guildIcon || undefined
          })
          .setTimestamp();

        await inviteTrackerChannel.send({ embeds: [inviteTrackerEmbed] });
        logger.success(`[${guild.name}] Sent invite tracker log for ${user.tag} in #${inviteTrackerChannel.name}`);
      }
    } catch (err) {
      logger.error(`[${guild.name}] Failed to send invite tracker log for ${user.tag}: ${err.message}`);
    }
  }
};
