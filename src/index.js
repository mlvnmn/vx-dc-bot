const { Client, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const config = require('./config');
const logger = require('./utils/logger');

// ==========================================
// 0. Lightweight Keep-Alive HTTP Server & Self-Pinger
// ==========================================
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('VX OFFICIAL Bot is online and healthy!');
}).listen(PORT, '0.0.0.0', () => {
  logger.info(`Keep-alive HTTP server listening on 0.0.0.0:${PORT}`);
});

// Automatic self-pinger to prevent Render free instance from sleeping
const renderUrl = process.env.RENDER_EXTERNAL_URL;
if (renderUrl) {
  setInterval(() => {
    https.get(renderUrl, (res) => {
      logger.info(`[Self-Ping] Sent keep-alive ping to ${renderUrl} (Status: ${res.statusCode})`);
    }).on('error', (err) => {
      logger.warn(`[Self-Ping] Keep-alive ping failed: ${err.message}`);
    });
  }, 4 * 60 * 1000); // 4 minutes
}

// ==========================================
// 1. Process Level Error Handling
// ==========================================
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception thrown:', error);
});

// ==========================================
// 2. Token & Environment Validation
// ==========================================
if (!config.token || config.token === 'your_discord_bot_token_here') {
  logger.error('Missing Discord Bot Token!');
  logger.error('Please configure TOKEN in your .env file before starting the bot.');
  logger.error('Refer to .env.example or README.md for instructions.');
  process.exit(1);
}

// ==========================================
// 3. Client Initialization with Intents
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // Privileged intent for join/leave events
    GatewayIntentBits.GuildExpressions, // Intent for soundboard sounds, emojis, and stickers
    GatewayIntentBits.GuildInvites,  // Intent for tracking invite creation & deletion
    GatewayIntentBits.DirectMessages, // Intent for receiving DMs
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration
  ],
  partials: [
    Partials.GuildMember,
    Partials.User,
    Partials.Channel,
    Partials.Message
  ]
});

const { initMusicPlayer } = require('./utils/musicPlayer');
initMusicPlayer(client).catch((err) => {
  logger.error(`Failed to initialize music player: ${err.message}`);
});

// ==========================================
// 4. Modular Event Loader
// ==========================================
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    try {
      const event = require(filePath);
      if (!event.name || typeof event.execute !== 'function') {
        logger.warn(`Skipping event file ${file}: Missing "name" or "execute" function.`);
        continue;
      }

      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }

      logger.info(`Loaded event: ${event.name} (from ${file})`);
    } catch (err) {
      logger.error(`Failed to load event ${file}: ${err.message}`);
    }
  }
} else {
  logger.warn(`Events directory not found at: ${eventsPath}`);
}

// ==========================================
// 5. Graceful Shutdown Handlers
// ==========================================
const handleShutdown = (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  client.destroy();
  process.exit(0);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// ==========================================
// 6. Connect to Discord Gateway with Retry
// ==========================================
async function connectWithRetry(retries = 5, delay = 5000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.info(`Connecting to Discord Gateway (attempt ${attempt}/${retries})...`);
      await client.login(config.token);
      return; // Connected successfully!
    } catch (err) {
      logger.error(`Discord login failed: ${err.message}`);
      if (err.message.includes('Disallowed intent')) {
        logger.error('CRITICAL: Privileged Gateway Intents are disabled in the Discord Developer Portal!');
        logger.error('Please enable BOTH of the following in Discord Developer Portal:');
        logger.error('1. Application -> Bot -> Privileged Gateway Intents -> Server Members Intent (ON)');
        logger.error('2. Application -> Bot -> Privileged Gateway Intents -> Message Content Intent (ON)');
        setTimeout(() => process.exit(1), 500);
        return;
      }
      if (err.message.includes('An invalid token was provided')) {
        logger.error('CRITICAL: The token in your environment is invalid or expired. Please reset your token in Discord Developer Portal and update Render.');
        setTimeout(() => process.exit(1), 500);
        return;
      }
      if (attempt < retries) {
        logger.warn(`Discord API may be experiencing temporary server issues (500/network). Retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        logger.error('Exceeded maximum login attempts. Please check Discord status and try again.');
        setTimeout(() => process.exit(1), 500);
        return;
      }
    }
  }
}

connectWithRetry();
