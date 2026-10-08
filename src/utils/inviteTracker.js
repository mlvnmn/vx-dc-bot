const logger = require('./logger');

// In-memory cache mapping: guildId -> Map<inviteCode, { code, uses, inviterId, inviterTag, inviter }>
const guildInvitesCache = new Map();

/**
 * Fetch and cache all current invites for a specific guild
 * @param {import('discord.js').Guild} guild
 */
async function cacheGuildInvites(guild) {
  if (!guild || !guild.invites) return;

  try {
    const invites = await guild.invites.fetch();
    const invitesMap = new Map();

    invites.forEach((invite) => {
      const inviter = invite.inviter || null;
      invitesMap.set(invite.code, {
        code: invite.code,
        uses: invite.uses || 0,
        inviterId: inviter ? inviter.id : null,
        inviterTag: inviter ? (inviter.tag || `@${inviter.username}`) : 'Unknown',
        inviter: inviter
      });
    });

    guildInvitesCache.set(guild.id, invitesMap);
    logger.info(`[${guild.name}] Cached ${invitesMap.size} invite(s) for invite tracker.`);
  } catch (err) {
    logger.warn(
      `[${guild.name}] Could not cache invites. Ensure the bot has "Manage Server" (ManageGuild) permission: ${err.message}`
    );
  }
}

/**
 * Initialize invite cache across all guilds the bot is currently in
 * @param {import('discord.js').Client} client
 */
async function initInviteTracker(client) {
  logger.info('Initializing invite tracker cache across all guilds...');
  for (const guild of client.guilds.cache.values()) {
    await cacheGuildInvites(guild);
  }
}

/**
 * Handle new invite created event
 * @param {import('discord.js').Invite} invite
 */
function handleInviteCreate(invite) {
  if (!invite.guild) return;
  const guildMap = guildInvitesCache.get(invite.guild.id) || new Map();
  const inviter = invite.inviter || null;

  guildMap.set(invite.code, {
    code: invite.code,
    uses: invite.uses || 0,
    inviterId: inviter ? inviter.id : null,
    inviterTag: inviter ? (inviter.tag || `@${inviter.username}`) : 'Unknown',
    inviter: inviter
  });

  guildInvitesCache.set(invite.guild.id, guildMap);
  logger.info(`[${invite.guild.name}] Tracked new invite created: ${invite.code} by ${inviter ? inviter.username : 'Unknown'}`);
}

/**
 * Handle invite deleted event
 * @param {import('discord.js').Invite} invite
 */
function handleInviteDelete(invite) {
  if (!invite.guild) return;
  const guildMap = guildInvitesCache.get(invite.guild.id);
  if (guildMap) {
    guildMap.delete(invite.code);
    logger.info(`[${invite.guild.name}] Tracked invite deleted: ${invite.code}`);
  }
}

/**
 * Determine which invite was used when a new member joins
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<Object>} Object containing details about the used invite
 */
async function findUsedInvite(guild) {
  const cachedInvites = guildInvitesCache.get(guild.id) || new Map();
  let result = {
    code: 'Unknown / Direct / Single-Use',
    inviter: null,
    inviterId: null,
    inviterTag: 'Unknown / Direct',
    uses: 0,
    totalInviterUses: 0,
    type: 'unknown'
  };

  if (!guild || !guild.invites) {
    return result;
  }

  try {
    const freshInvites = await guild.invites.fetch();
    let matchedInvite = null;

    // 1. Compare fresh invite uses against cached uses
    for (const [code, fresh] of freshInvites) {
      const cached = cachedInvites.get(code);
      if (cached && fresh.uses > cached.uses) {
        matchedInvite = fresh;
        break;
      } else if (!cached && fresh.uses > 0) {
        matchedInvite = fresh;
        break;
      }
    }

    // 2. Fallback check: Guild Vanity URL
    if (!matchedInvite && guild.vanityURLCode) {
      try {
        const vanity = await guild.fetchVanityData();
        const cachedVanity = cachedInvites.get('VANITY_URL');
        if (cachedVanity && vanity.uses > cachedVanity.uses) {
          result = {
            code: guild.vanityURLCode,
            inviter: null,
            inviterId: null,
            inviterTag: 'Vanity URL',
            uses: vanity.uses,
            totalInviterUses: vanity.uses,
            type: 'vanity'
          };
        }
        cachedInvites.set('VANITY_URL', { uses: vanity.uses });
      } catch (_) {}
    }

    // 3. Process matched standard invite
    if (matchedInvite) {
      const inviter = matchedInvite.inviter || null;
      let totalInviterUses = 0;

      // Calculate total uses for this inviter across all active invites in guild
      if (inviter) {
        freshInvites.forEach((inv) => {
          if (inv.inviter && inv.inviter.id === inviter.id) {
            totalInviterUses += inv.uses || 0;
          }
        });
      }

      result = {
        code: matchedInvite.code,
        inviter: inviter,
        inviterId: inviter ? inviter.id : null,
        inviterTag: inviter ? (inviter.tag || `@${inviter.username}`) : 'Unknown',
        uses: matchedInvite.uses,
        totalInviterUses: totalInviterUses || matchedInvite.uses,
        type: 'invite'
      };
    }

    // 4. Refresh cache with fresh invite list
    const updatedMap = new Map();
    freshInvites.forEach((inv) => {
      const inviter = inv.inviter || null;
      updatedMap.set(inv.code, {
        code: inv.code,
        uses: inv.uses || 0,
        inviterId: inviter ? inviter.id : null,
        inviterTag: inviter ? (inviter.tag || `@${inviter.username}`) : 'Unknown',
        inviter: inviter
      });
    });
    guildInvitesCache.set(guild.id, updatedMap);

  } catch (err) {
    logger.warn(`[${guild.name}] Failed to resolve used invite: ${err.message}`);
  }

  return result;
}

module.exports = {
  cacheGuildInvites,
  initInviteTracker,
  handleInviteCreate,
  handleInviteDelete,
  findUsedInvite
};
