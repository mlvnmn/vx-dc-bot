const { ChannelType, PermissionFlagsBits } = require('discord.js');
const logger = require('./logger');
const { toSmallCaps, fromSmallCaps } = require('./formatters');

/**
 * Normalizes a channel name string by converting Small Caps characters to ASCII,
 * converting to lower case, and stripping non-alphanumeric characters.
 * E.g., "🛬〢ᴡᴇʟᴄᴏᴍᴇ" -> "welcome"
 * @param {string} str 
 * @returns {string}
 */
function normalizeChannelName(str) {
  if (!str) return '';
  const asciiStr = fromSmallCaps(str);
  return asciiStr.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

/**
 * Resolves a target text channel by specific ID or prioritized list of channel names.
 * Supports matching standard names, Small Caps aesthetic names, and emoji prefixes.
 * 
 * @param {import('discord.js').Guild} guild The guild to search within
 * @param {object} channelConfig Config object containing optional `id` and `names` array
 * @param {string} purpose Contextual label for logging (e.g. 'Welcome', 'Join Log')
 * @returns {import('discord.js').TextChannel|null}
 */
function resolveChannel(guild, channelConfig, purpose = 'Channel') {
  if (!guild || !guild.channels) {
    logger.warn(`Cannot resolve ${purpose}: Invalid guild provided.`);
    return null;
  }

  let channel = null;

  // 1. Try finding by ID if provided
  if (channelConfig.id) {
    channel = guild.channels.cache.get(channelConfig.id);
  }

  // 2. Try finding by candidate names in order
  if (!channel && Array.isArray(channelConfig.names)) {
    for (const name of channelConfig.names) {
      if (!name) continue;
      const cleanName = name.toLowerCase().trim();
      const normTarget = normalizeChannelName(cleanName);

      channel = guild.channels.cache.find((c) => {
        if (c.type !== ChannelType.GuildText && c.type !== ChannelType.GuildAnnouncement) {
          return false;
        }

        const channelNameLower = c.name.toLowerCase().trim();

        // Exact match
        if (channelNameLower === cleanName) return true;

        // Small caps formatted match
        const smallCapsName = toSmallCaps(cleanName);
        if (smallCapsName && c.name.includes(smallCapsName)) return true;

        // Normalized alphanumeric match (only if normalized target is non-empty)
        const normChan = normalizeChannelName(c.name);
        if (normTarget.length > 0 && normChan.length > 0 && normChan === normTarget) {
          return true;
        }

        return false;
      });

      if (channel) break;
    }
  }

  // If still not found, return null
  if (!channel) {
    const attemptedNames = (channelConfig.names || []).filter(Boolean).join(', ');
    logger.warn(
      `[${guild.name}] ${purpose} channel not found. Looked for ID "${channelConfig.id || 'none'}" or names: [${attemptedNames}].`
    );
    return null;
  }

  // Validate bot permissions in this channel
  const botMember = guild.members.me;
  if (botMember) {
    const permissions = channel.permissionsFor(botMember);
    const requiredPermissions = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks
    ];

    const missing = requiredPermissions.filter((perm) => !permissions.has(perm));
    if (missing.length > 0) {
      logger.warn(
        `[${guild.name}] Missing permissions in #${channel.name} (${purpose}): Bot needs View Channel, Send Messages, and Embed Links.`
      );
      return null;
    }
  }

  return channel;
}

/**
 * Automatically format all categories and channels in a guild to Small Caps aesthetic font
 * @param {import('discord.js').Guild} guild 
 * @returns {Promise<{ updated: number, skipped: number }>}
 */
async function styleAllChannels(guild) {
  let updated = 0;
  let skipped = 0;

  if (!guild || !guild.channels) return { updated, skipped };

  const botMember = guild.members.me;
  if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    logger.warn(`[${guild.name}] Cannot style channels: Bot lacks "Manage Channels" permission.`);
    return { updated, skipped };
  }

  const channels = Array.from(guild.channels.cache.values());

  for (const channel of channels) {
    // Convert channel name to Small Caps
    const styledName = toSmallCaps(channel.name);

    if (channel.name !== styledName) {
      try {
        await channel.setName(styledName);
        updated++;
        logger.info(`[${guild.name}] Styled channel #${channel.name} -> ${styledName}`);
        // Small delay to prevent hitting Discord rate limits
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (err) {
        skipped++;
        logger.warn(`[${guild.name}] Could not rename channel #${channel.name}: ${err.message}`);
      }
    } else {
      skipped++;
    }
  }

  return { updated, skipped };
}

module.exports = {
  resolveChannel,
  styleAllChannels
};
