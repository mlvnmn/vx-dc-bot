const { Events, PermissionFlagsBits, ApplicationCommandOptionType } = require('discord.js');
const logger = require('../utils/logger');
const config = require('../config');
const { resolveChannel } = require('../utils/channelHelper');
const { resolveRole } = require('../utils/roleHelper');
const { deployRolesPanel } = require('../utils/rolesPanel');
const { initInviteTracker } = require('../utils/inviteTracker');
const { syncChannelPermissions } = require('../utils/privateVoiceHelper');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    logger.success(`Logged in as ${client.user.tag} (ID: ${client.user.id})`);
    logger.info(`Serving ${client.guilds.cache.size} server(s)`);
    logger.info(`🔗 Bot Invite URL: https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`);

    // Clean appearance: no custom status text
    try {
      client.user.setPresence({
        activities: [],
        status: 'online'
      });
    } catch (err) {
      logger.warn(`Failed to set presence: ${err.message}`);
    }

    // Initialize invite tracking cache for all guilds
    await initInviteTracker(client);

    // Command definitions
    const commandsData = [
      {
        name: 'setup-roles',
        description: 'Deploy or refresh the interactive role selection panel in #roles',
        defaultMemberPermissions: PermissionFlagsBits.ManageRoles
      },
      {
        name: 'setup-logs',
        description: 'Automatically create and configure all 6 private log channels under LOGS!',
        defaultMemberPermissions: PermissionFlagsBits.Administrator
      },
      {
        name: 'setup-tickets',
        description: 'Deploy or refresh the Ticket System V2 panel in #ticket',
        defaultMemberPermissions: PermissionFlagsBits.ManageChannels
      },
      {
        name: 'add',
        description: 'Add a user to the current ticket',
        defaultMemberPermissions: PermissionFlagsBits.ManageMessages,
        options: [
          {
            name: 'user',
            description: 'The member to add to this ticket',
            type: ApplicationCommandOptionType.User,
            required: true
          }
        ]
      },
      {
        name: 'remove',
        description: 'Remove a user from the current ticket',
        defaultMemberPermissions: PermissionFlagsBits.ManageMessages,
        options: [
          {
            name: 'user',
            description: 'The member to remove from this ticket',
            type: ApplicationCommandOptionType.User,
            required: true
          }
        ]
      },
      {
        name: 'clear-chat',
        description: 'Delete messages in the current channel',
        defaultMemberPermissions: PermissionFlagsBits.ManageMessages,
        options: [
          {
            name: 'amount',
            description: 'Number of messages to delete (1-100, default: 100)',
            type: ApplicationCommandOptionType.Integer,
            required: false,
            min_value: 1,
            max_value: 100
          }
        ]
      },
      {
        name: 'dm',
        description: 'Send a direct message (DM) to a user or role using the bot',
        defaultMemberPermissions: PermissionFlagsBits.ManageMessages,
        options: [
          {
            name: 'message',
            description: 'The message content to send',
            type: ApplicationCommandOptionType.String,
            required: true
          },
          {
            name: 'user',
            description: 'The user to send a DM to (optional if role is specified)',
            type: ApplicationCommandOptionType.User,
            required: false
          },
          {
            name: 'role',
            description: 'The role whose members will receive the DM (optional if user is specified)',
            type: ApplicationCommandOptionType.Role,
            required: false
          }
        ]
      },
      {
        name: 'style-channels',
        description: 'Convert all server channels and categories to Small Caps aesthetic font',
        defaultMemberPermissions: PermissionFlagsBits.ManageChannels
      },
      {
        name: 'private-vc',
        description: 'Manage access for private voice channel "w"',
        options: [
          {
            name: 'allow',
            description: 'Grant access to a member for private voice channel "w"',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              {
                name: 'user',
                description: 'The member to allow access to',
                type: ApplicationCommandOptionType.User,
                required: true
              }
            ]
          },
          {
            name: 'deny',
            description: 'Revoke access from a member for private voice channel "w"',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              {
                name: 'user',
                description: 'The member to revoke access from',
                type: ApplicationCommandOptionType.User,
                required: true
              }
            ]
          },
          {
            name: 'list',
            description: 'List members authorized to join private voice channel "w"',
            type: ApplicationCommandOptionType.Subcommand
          },
          {
            name: 'claim',
            description: 'Claim ownership of private voice channel "w"',
            type: ApplicationCommandOptionType.Subcommand
          }
        ]
      },
      {
        name: 'play',
        description: 'Play music in your voice channel from YouTube, Spotify, SoundCloud, or audio URLs',
        options: [
          {
            name: 'query',
            description: 'Song URL (YouTube, Spotify, SoundCloud, MP3) or search title',
            type: ApplicationCommandOptionType.String,
            required: true
          }
        ]
      },
      {
        name: 'pause',
        description: 'Pause current music playback'
      },
      {
        name: 'resume',
        description: 'Resume paused music playback'
      },
      {
        name: 'skip',
        description: 'Skip current track'
      },
      {
        name: 'stop',
        description: 'Stop music playback, clear queue, and leave voice channel'
      },
      {
        name: 'queue',
        description: 'Display current music queue'
      },
      {
        name: 'nowplaying',
        description: 'Show details and progress of currently playing track'
      },
      {
        name: 'volume',
        description: 'Set music playback volume (1-100)',
        options: [
          {
            name: 'level',
            description: 'Volume level between 1 and 100',
            type: ApplicationCommandOptionType.Integer,
            required: true,
            min_value: 1,
            max_value: 100
          }
        ]
      },
      {
        name: 'status',
        description: 'Configure bot presence status, activity type, and custom status text',
        defaultMemberPermissions: PermissionFlagsBits.ManageGuild
      }
    ];

    // Register slash commands (Globally & Per-Guild for instant loading)
    try {
      if (client.application) {
        await client.application.commands.set(commandsData);
        logger.info('Registered global slash commands: /setup-roles, /clear-chat, /dm, /style-channels, /private-vc, /play, /pause, /resume, /skip, /stop, /queue, /nowplaying, /volume, /status');
      }
      for (const guild of client.guilds.cache.values()) {
        await guild.commands.set(commandsData).catch((err) => {
          logger.warn(`[${guild.name}] Instant guild command registration notice: ${err.message}`);
        });
      }
    } catch (err) {
      logger.warn(`Failed to register slash commands: ${err.message}`);
    }

    // Auto-check and setup for each server
    for (const guild of client.guilds.cache.values()) {
      // Sync private voice channel permissions on startup
      await syncChannelPermissions(guild);
      // 1. Verify roles exist
      const visitorRole = resolveRole(guild, config.roles.visitor);
      const crewRole = resolveRole(guild, config.roles.crew);
      const magneraRole = resolveRole(guild, config.roles.magnera);

      if (!visitorRole) {
        logger.warn(`[${guild.name}] Role "${config.roles.visitor.name}" not found. Please create it in your server.`);
      }
      if (!crewRole) {
        logger.warn(`[${guild.name}] Role "${config.roles.crew.name}" not found. Please create it in your server.`);
      }
      if (!magneraRole) {
        logger.warn(`[${guild.name}] Role "${config.roles.magnera.name}" not found. Please create it in your server.`);
      }

      // 2. Check roles channel (deploy only if dedicated #roles channel exists)
      const rolesChannel = resolveChannel(guild, config.channels.roles, 'Roles Channel');
      if (rolesChannel && (rolesChannel.name.includes('role') || rolesChannel.name.includes('select'))) {
        await deployRolesPanel(rolesChannel);
      } else {
        logger.info(`[${guild.name}] Roles panel can be deployed anytime in any channel using /setup-roles`);
      }

      // 3. Check for admin approval channel
      const crewRequestsChannel = resolveChannel(guild, config.channels.crewRequests, 'Crew Requests');
      if (!crewRequestsChannel) {
        logger.warn(`[${guild.name}] Admin channel #${config.channels.crewRequests.names[0]} not found. Create it for Crew approval tickets!`);
      }

      // 4. Check for welcome channel
      const welcomeChannel = resolveChannel(guild, config.channels.welcome, 'Welcome Channel');
      if (welcomeChannel) {
        logger.info(`[${guild.name}] Welcome channel found: #${welcomeChannel.name}`);
      } else {
        logger.warn(`[${guild.name}] Channel #${config.channels.welcome.names[0]} not found. Create a "#welcome" channel to receive welcome messages.`);
      }

      // 5. Check for invite tracker channel
      const inviteTrackerChannel = resolveChannel(guild, config.channels.inviteTracker, 'Invite Tracker Channel');
      if (inviteTrackerChannel) {
        logger.info(`[${guild.name}] Invite tracker channel found: #${inviteTrackerChannel.name}`);
      } else {
        logger.warn(`[${guild.name}] Channel #${config.channels.inviteTracker.names[0]} not found.`);
      }

      // 6. Check for Create Voice trigger channel
      const { isTriggerChannel } = require('../utils/tempVoiceHelper');
      const createVoiceCh = guild.channels.cache.find((c) => isTriggerChannel(c));
      if (createVoiceCh) {
        logger.info(`[${guild.name}] Join-to-Create voice channel active: "${createVoiceCh.name}"`);
      } else {
        logger.info(`[${guild.name}] Join-to-Create voice channel notice: Create a voice channel named "➕ Create Voice" to enable automatic temp voice rooms.`);
      }

      // 7. Check for Staff Ping channel
      const staffPingChannel = resolveChannel(guild, config.channels.staffPing, 'Staff Ping Channel');
      if (staffPingChannel) {
        logger.info(`[${guild.name}] Staff ping channel active: #${staffPingChannel.name}`);
      } else {
        logger.info(`[${guild.name}] Staff ping channel notice: Ensure a channel named "#! · PING" or "#ping" exists for Support Waiting alerts.`);
      }
    }

    logger.success(`Bot is fully ready and monitoring member & invite events.`);
  }
};
