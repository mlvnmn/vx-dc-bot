/**
 * Format milliseconds into human-readable duration
 * @param {number} ms Duration in milliseconds
 * @returns {string} Formatted duration string
 */
function formatDuration(ms) {
  if (!ms || isNaN(ms) || ms < 0) return 'Unknown duration';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30.4375);
  const years = Math.floor(days / 365.25);

  const parts = [];

  if (years > 0) {
    parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
    const remMonths = Math.floor((days % 365.25) / 30.4375);
    if (remMonths > 0) parts.push(`${remMonths} ${remMonths === 1 ? 'month' : 'months'}`);
  } else if (months > 0) {
    parts.push(`${months} ${months === 1 ? 'month' : 'months'}`);
    const remDays = Math.floor(days % 30.4375);
    if (remDays > 0) parts.push(`${remDays} ${remDays === 1 ? 'day' : 'days'}`);
  } else if (days > 0) {
    parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    const remHours = hours % 24;
    if (remHours > 0) parts.push(`${remHours} ${remHours === 1 ? 'hour' : 'hours'}`);
  } else if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    const remMinutes = minutes % 60;
    if (remMinutes > 0) parts.push(`${remMinutes} ${remMinutes === 1 ? 'minute' : 'minutes'}`);
  } else if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  } else {
    parts.push('Less than a minute');
  }

  return parts.slice(0, 2).join(', ');
}

/**
 * Generate Discord markdown timestamp
 * @param {Date|number} date Date or timestamp
 * @param {'t'|'T'|'d'|'D'|'f'|'F'|'R'} style Timestamp style
 * @returns {string} Discord formatted timestamp e.g. <t:123456789:F>
 */
function getDiscordTimestamp(date, style = 'F') {
  const timestamp = typeof date === 'number' ? Math.floor(date / 1000) : Math.floor(new Date(date).getTime() / 1000);
  return `<t:${timestamp}:${style}>`;
}

/**
 * Format ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
 * @param {number} n
 * @returns {string}
 */
function getOrdinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Safely format user display tag
 * @param {import('discord.js').User} user
 * @returns {string}
 */
function formatUserTag(user) {
  if (!user) return 'Unknown User';
  // Discord new username system: user.discriminator is '0'
  if (user.discriminator && user.discriminator !== '0') {
    return `${user.username}#${user.discriminator}`;
  }
  return `@${user.username}`;
}

const smallCapsMap = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
  j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
  s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
  A: 'ᴀ', B: 'ʙ', C: 'ᴄ', D: 'ᴅ', E: 'ᴇ', F: 'ꜰ', G: 'ɢ', H: 'ʜ', I: 'ɪ',
  J: 'ᴊ', K: 'ᴋ', L: 'ʟ', M: 'ᴍ', N: 'ɴ', O: 'ᴏ', P: 'ᴘ', Q: 'ǫ', R: 'ʀ',
  S: 'ꜱ', T: 'ᴛ', U: 'ᴜ', V: 'ᴠ', W: 'ᴡ', X: 'x', Y: 'ʏ', Z: 'ᴢ'
};

const reverseSmallCapsMap = {};
for (const [k, v] of Object.entries(smallCapsMap)) {
  reverseSmallCapsMap[v] = k.toLowerCase();
}

/**
 * Convert standard text to Small Caps aesthetic font (e.g., "VX OFFICIAL" -> "ᴠx ᴏғғɪᴄɪᴀʟ")
 * @param {string} str
 * @returns {string}
 */
function toSmallCaps(str) {
  if (!str) return '';
  return str.split('').map((char) => smallCapsMap[char] || char).join('');
}

/**
 * Convert Small Caps text back to standard lowercase ASCII text (e.g., "ᴠx ᴏғғɪᴄɪᴀʟ" -> "vx official")
 * @param {string} str
 * @returns {string}
 */
function fromSmallCaps(str) {
  if (!str) return '';
  return str.split('').map((char) => reverseSmallCapsMap[char] || char).join('');
}

module.exports = {
  formatDuration,
  getDiscordTimestamp,
  getOrdinal,
  formatUserTag,
  toSmallCaps,
  fromSmallCaps
};

