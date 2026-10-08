const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const logger = require('./logger');
const { resolveRole } = require('./roleHelper');
const { toSmallCaps } = require('./formatters');

/**
 * Creates the Role Selection embed and action buttons
 * @param {import('discord.js').Guild} guild 
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
function createRolesPanelData(guild) {
  const guildIcon = guild.iconURL({ dynamic: true, size: 128 });

  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`🎭 ${toSmallCaps('Choose Your Role')} | ${toSmallCaps(config.serverName)}`)
    .setDescription(
      `Welcome to **${config.serverName}**! Please choose your server role below:\n\n` +
      `🌐 **${config.roles.visitor.name}**\n` +
      `• Browse the community and hang out in public chat channels.\n` +
      `• Instantly assigned.\n\n` +
      `🚀 **${config.roles.crew.name}** *(${toSmallCaps('Admin Approval Required')})*\n` +
      `• Become an official team member with access to crew channels & projects.\n` +
      `• Clicking below sends your application to server administrators for review.\n\n` +
      `✨ **${config.roles.magnera.name}** *(${toSmallCaps('Admin Approval Required')})*\n` +
      `• Access to general channels & the Magnera Fest section.\n` +
      `• Clicking below sends your application to server administrators for review.`
    )
    .addFields({
      name: `ℹ️ ${toSmallCaps('Instructions')}`,
      value: `Click **${config.roles.visitor.name}** for standard access, or **Apply for ${config.roles.crew.name}** / **Apply for ${config.roles.magnera.name}** to submit an approval request to the admins.`
    })
    .setFooter({
      text: `${config.serverName} • ${toSmallCaps('Select an option below')}`,
      iconURL: guildIcon || undefined
    })
    .setTimestamp();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('select_role_visitor')
      .setLabel(toSmallCaps(config.roles.visitor.name))
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🌐'),
    new ButtonBuilder()
      .setCustomId('apply_role_crew')
      .setLabel(toSmallCaps(`Apply for ${config.roles.crew.name}`))
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🚀'),
    new ButtonBuilder()
      .setCustomId('apply_role_magnera')
      .setLabel(toSmallCaps(`Apply for ${config.roles.magnera.name}`))
      .setStyle(ButtonStyle.Primary)
      .setEmoji('✨')
  );

  return {
    embeds: [embed],
    components: [buttons]
  };
}

/**
 * Deploys or updates the role panel in the designated channel
 * @param {import('discord.js').TextChannel} channel 
 */
async function deployRolesPanel(channel) {
  try {
    const { guild } = channel;
    const panelData = createRolesPanelData(guild);

    // Ensure #roles channel is hidden for members with the Crew / Team Magnera roles
    const crewRole = resolveRole(guild, config.roles.crew);
    const magneraRole = resolveRole(guild, config.roles.magnera);
    const botMember = guild.members.me;

    if (botMember && channel.permissionsFor(botMember).has(PermissionFlagsBits.ManageChannels)) {
      if (crewRole) {
        try {
          await channel.permissionOverwrites.edit(crewRole.id, { ViewChannel: false });
          logger.info(`[${guild.name}] Configured #${channel.name} permissions: Hidden for "@${crewRole.name}" role.`);
        } catch (permErr) {
          logger.warn(`[${guild.name}] Could not set ViewChannel:false on #${channel.name} for @${crewRole.name}: ${permErr.message}`);
        }
      }
      if (magneraRole) {
        try {
          await channel.permissionOverwrites.edit(magneraRole.id, { ViewChannel: false });
          logger.info(`[${guild.name}] Configured #${channel.name} permissions: Hidden for "@${magneraRole.name}" role.`);
        } catch (permErr) {
          logger.warn(`[${guild.name}] Could not set ViewChannel:false on #${channel.name} for @${magneraRole.name}: ${permErr.message}`);
        }
      }
    }

    // Look for existing bot panel messages in the channel (match by bot ID and button customIds)
    const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (messages) {
      const botPanelMsgs = Array.from(
        messages.filter(
          (m) =>
            m.author.id === channel.client.user.id &&
            (m.components.some((row) =>
              row.components.some((b) => b.customId === 'select_role_visitor' || b.customId === 'apply_role_crew' || b.customId === 'apply_role_magnera')
            ) ||
              (m.embeds.length > 0 &&
                (m.embeds[0].title?.includes('Choose Your Role') ||
                 m.embeds[0].title?.includes(toSmallCaps('Choose Your Role')))))
        ).values()
      );

      if (botPanelMsgs.length > 0) {
        // Keep the newest message and edit it
        const existingBotMsg = botPanelMsgs[0];

        // Delete any extra duplicate older panel messages in the channel
        for (let i = 1; i < botPanelMsgs.length; i++) {
          await botPanelMsgs[i].delete().catch(() => {});
        }

        await existingBotMsg.edit(panelData);
        logger.info(`[${channel.guild.name}] Refreshed single role panel in #${channel.name} (cleaned duplicates).`);
        return existingBotMsg;
      }
    }

    const sent = await channel.send(panelData);
    logger.success(`[${channel.guild.name}] Deployed new role panel in #${channel.name}`);
    return sent;
  } catch (err) {
    logger.error(`[${channel.guild.name}] Failed to deploy role panel in #${channel.name}: ${err.message}`);
    return null;
  }
}

module.exports = {
  createRolesPanelData,
  deployRolesPanel
};
