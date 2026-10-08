const { PermissionFlagsBits } = require('discord.js');
const logger = require('./logger');

/**
 * Resolves a Role from a guild by configured ID or name.
 * 
 * @param {import('discord.js').Guild} guild 
 * @param {object} roleConfig Object with `id` and `name`
 * @returns {import('discord.js').Role|null}
 */
function resolveRole(guild, roleConfig) {
  if (!guild || !roleConfig) return null;

  let role = null;

  // 1. Try finding by ID
  if (roleConfig.id) {
    role = guild.roles.cache.get(roleConfig.id);
  }

  // 2. Try finding by Name (case-insensitive & plural/singular friendly)
  if (!role && roleConfig.name) {
    const targetName = roleConfig.name.toLowerCase().trim();
    role = guild.roles.cache.find((r) => r.name.toLowerCase() === targetName);

    // Fallback: Plural or singular matching (e.g., 'Visitor' <-> 'Visitors')
    if (!role) {
      role = guild.roles.cache.find((r) => {
        const name = r.name.toLowerCase().trim();
        return (
          name === targetName + 's' ||
          name + 's' === targetName ||
          name.includes(targetName) ||
          targetName.includes(name)
        );
      });
    }
  }

  return role;
}

/**
 * Validates if the bot has permission and hierarchy to assign/remove a role.
 * 
 * @param {import('discord.js').Guild} guild 
 * @param {import('discord.js').Role} role 
 * @returns {{ canManage: boolean, reason?: string }}
 */
function canBotManageRole(guild, role) {
  const botMember = guild.members.me;
  if (!botMember) {
    return { canManage: false, reason: 'Bot member not found in guild.' };
  }

  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { canManage: false, reason: 'Bot is missing "Manage Roles" permission.' };
  }

  // Discord role hierarchy: bot's highest role must be higher than the target role
  if (botMember.roles.highest.position <= role.position) {
    return {
      canManage: false,
      reason: `Bot's role (@${botMember.roles.highest.name}) is lower than or equal to @${role.name}. Drag the bot's role higher in Server Settings -> Roles.`
    };
  }

  return { canManage: true };
}

/**
 * Safely assign a role to a member with hierarchy checks and clear logging.
 * 
 * @param {import('discord.js').GuildMember} member 
 * @param {import('discord.js').Role} role 
 * @returns {Promise<boolean>} Success
 */
async function safelyAddRole(member, role) {
  if (!member || !role) return false;

  const check = canBotManageRole(member.guild, role);
  if (!check.canManage) {
    logger.warn(`[${member.guild.name}] Cannot add @${role.name} to ${member.user.tag}: ${check.reason}`);
    return false;
  }

  try {
    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, 'Automated role assignment');
      logger.success(`[${member.guild.name}] Assigned role @${role.name} to ${member.user.tag}`);
    }
    return true;
  } catch (err) {
    logger.error(`[${member.guild.name}] Failed to assign @${role.name} to ${member.user.tag}: ${err.message}`);
    return false;
  }
}

/**
 * Safely remove a role from a member.
 * 
 * @param {import('discord.js').GuildMember} member 
 * @param {import('discord.js').Role} role 
 * @returns {Promise<boolean>} Success
 */
async function safelyRemoveRole(member, role) {
  if (!member || !role) return false;

  const check = canBotManageRole(member.guild, role);
  if (!check.canManage) {
    logger.warn(`[${member.guild.name}] Cannot remove @${role.name} from ${member.user.tag}: ${check.reason}`);
    return false;
  }

  try {
    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role, 'Automated role update');
      logger.info(`[${member.guild.name}] Removed role @${role.name} from ${member.user.tag}`);
    }
    return true;
  } catch (err) {
    logger.error(`[${member.guild.name}] Failed to remove @${role.name} from ${member.user.tag}: ${err.message}`);
    return false;
  }
}

module.exports = {
  resolveRole,
  canBotManageRole,
  safelyAddRole,
  safelyRemoveRole
};
