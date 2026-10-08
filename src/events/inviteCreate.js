const { Events } = require('discord.js');
const { handleInviteCreate } = require('../utils/inviteTracker');

module.exports = {
  name: Events.InviteCreate,
  async execute(invite) {
    handleInviteCreate(invite);
  }
};
