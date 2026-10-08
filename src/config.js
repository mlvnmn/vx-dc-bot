require('dotenv').config();

const config = {
  // Authentication credentials
  token: (process.env.TOKEN || process.env.DISCORD_TOKEN || '').trim().replace(/^["']|["']$/g, ''),
  clientId: (process.env.CLIENT_ID || '').trim().replace(/^["']|["']$/g, ''),

  // Server Branding
  serverName: process.env.SERVER_NAME || 'VX OFFICIAL',

  // Role Configuration
  roles: {
    visitor: {
      id: process.env.VISITOR_ROLE_ID || null,
      name: process.env.VISITOR_ROLE || 'Visitors'
    },
    crew: {
      id: process.env.CREW_ROLE_ID || null,
      name: process.env.CREW_ROLE || 'Staff'
    },
    magnera: {
      id: process.env.MAGNERA_ROLE_ID || null,
      name: process.env.MAGNERA_ROLE || 'VIP'
    },
    core: {
      id: process.env.CORE_ROLE_ID || null,
      name: process.env.CORE_ROLE || 'Admin'
    }
  },

  // Channel configuration
  channels: {
    welcome: {
      id: process.env.WELCOME_CHANNEL_ID || null,
      names: [process.env.WELCOME_CHANNEL || 'welcome', 'welcome', 'welcomes', 'general-welcome', 'welcome-chat']
    },
    roles: {
      id: process.env.ROLES_CHANNEL_ID || null,
      names: [process.env.ROLES_CHANNEL || 'roles', 'roles', 'choose-roles', 'get-roles', 'select-roles', 'role-selection']
    },
    crewRequests: {
      id: process.env.CREW_REQUESTS_CHANNEL_ID || null,
      names: [
        process.env.CREW_REQUESTS_CHANNEL || 'crew-requests',
        'ticket-transcripts',
        'tickets-v2',
        'tickets-admin',
        'tickets-support',
        'crew-requests',
        'admin-approval',
        'crew-approval',
        'role-requests'
      ]
    },
    joinLogs: {
      id: process.env.JOIN_LOG_CHANNEL_ID || null,
      names: [process.env.JOIN_LOG_CHANNEL || 'join-logs', 'join-logs', 'vc-join', 'log-duh', 'member-logs']
    },
    exitLogs: {
      id: process.env.EXIT_LOG_CHANNEL_ID || null,
      names: [process.env.EXIT_LOG_CHANNEL || 'exit-logs', 'exit-logs', 'vc-join', 'leave-logs', 'member-logs']
    },
    inviteTracker: {
      id: process.env.INVITE_TRACKER_CHANNEL_ID || null,
      names: [
        process.env.INVITE_TRACKER_CHANNEL || 'invite-tracker',
        'invite-tracker',
        'invites',
        'invite-logs',
        'invite-log',
        'invites-tracker'
      ]
    },
    dms: {
      id: process.env.DMS_CHANNEL_ID || null,
      names: [
        process.env.DMS_CHANNEL || 'dms',
        'dms',
        'dm-logs',
        'direct-messages',
        'dm-log',
        'modmail'
      ]
    },
    createVoice: {
      id: process.env.CREATE_VOICE_CHANNEL_ID || null,
      names: [
        process.env.CREATE_VOICE_CHANNEL || 'create-voice',
        'create-voice',
        'create voice',
        '➕ create voice',
        '➕ create-voice',
        'join to create',
        '➕ join to create',
        'create vc'
      ]
    },
    voiceLogs: {
      id: process.env.VOICE_LOG_CHANNEL_ID || null,
      names: [
        process.env.VOICE_LOG_CHANNEL || 'voice-logs',
        'voice-logs',
        'vc-join',
        'voice-log',
        'voicelogs',
        'vc-logs',
        'vc-log'
      ]
    },
    soundboardLogs: {
      id: process.env.SOUNDBOARD_LOG_CHANNEL_ID || null,
      names: [
        process.env.SOUNDBOARD_LOG_CHANNEL || 'soundboards-logs',
        'soundboards-logs',
        'soundboard-logs',
        'soundboardlogs',
        'soundboard-log',
        'soundboard',
        'soundboards',
        'sound-logs',
        'sound-log',
        'soundboard-events',
        'soundboard-channel',
        'sound-board',
        'sound-board-logs'
      ]
    },
    deletedMessageLogs: {
      id: process.env.DELETED_MESSAGE_LOG_CHANNEL_ID || null,
      names: [
        process.env.DELETED_MESSAGE_LOG_CHANNEL || 'deletd-message-logs',
        'deletd-message-logs',
        'deleted-message-logs',
        'message-delete',
        'deleted-messages',
        'delete-logs',
        'message-logs'
      ]
    },
    accountLogs: {
      id: process.env.ACCOUNT_LOG_CHANNEL_ID || null,
      names: [
        process.env.ACCOUNT_LOG_CHANNEL || 'account-logs',
        'account-logs',
        'automod',
        'accountlogs',
        'user-logs',
        'profile-logs'
      ]
    }
  },

  // Embed Color Scheme
  colors: {
    welcome: 0x5865F2,   // Discord Blurple / Vibrant Blue
    primary: 0x5865F2,   // Discord Blurple
    joinLog: 0x2ECC71,   // Emerald Green accent
    exitLog: 0xE74C3C,   // Coral Red accent
    warning: 0xFEE75C,   // Amber Warning
    error: 0xED4245,     // Alert Red
    inviteTracker: 0x3498DB, // Ocean Blue accent
    dms: 0x9B59B6,       // Purple / Modmail accent
    voiceLog: 0x2ECC71,  // Voice log accent
    soundboardLog: 0x9B59B6, // Soundboard log accent
    deletedMessageLog: 0xED4245, // Deleted message log accent
    accountLog: 0x3498DB // Account log accent
  }
};

module.exports = config;
