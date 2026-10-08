const { Events } = require('discord.js');
const { handleInviteDelete } = require('../utils/inviteTracker');

module.exports = {
  name: Events.InviteDelete,
  async execute(invite) {
    handleInviteDelete(invite);
  }
};
