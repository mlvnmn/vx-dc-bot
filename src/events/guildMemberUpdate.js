const { Events } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const { resolveRole, safelyRemoveRole } = require('../utils/roleHelper');

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    const { guild } = newMember;
    const crewRole = resolveRole(guild, config.roles.crew);
    const visitorRole = resolveRole(guild, config.roles.visitor);

    if (!crewRole || !visitorRole) return;

    // Check if member just received the Crew role
    const gainedCrew = !oldMember.roles.cache.has(crewRole.id) && newMember.roles.cache.has(crewRole.id);

    if (gainedCrew) {
      if (newMember.roles.cache.has(visitorRole.id)) {
        logger.info(`[${guild.name}] Member ${newMember.user.tag} received Crew role. Automatically removing Visitor role...`);
        await safelyRemoveRole(newMember, visitorRole);
      }
    }
  }
};
