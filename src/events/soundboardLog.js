const { Events, EmbedBuilder } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const { resolveChannel } = require('../utils/channelHelper');

// Deduplication map to prevent double logging if both raw and native discord.js events trigger
const recentSoundboardLogs = new Map();

function cleanDedupeMap() {
  const now = Date.now();
  for (const [key, timestamp] of recentSoundboardLogs.entries()) {
    if (now - timestamp > 5000) {
      recentSoundboardLogs.delete(key);
    }
  }
}

setInterval(cleanDedupeMap, 10000);

// Default Discord Soundboard Sounds mapping for standard built-in sound IDs
const DEFAULT_SOUNDBOARD_SOUNDS = {
  '1': { name: 'Quack', emoji: '🦆' },
  '2': { name: 'Airhorn', emoji: '🎺' },
  '3': { name: 'Cricket', emoji: '🦗' },
  '4': { name: 'Golf Clap', emoji: '👏' },
  '5': { name: 'Sad Trombone', emoji: '🎺' },
  '6': { name: 'Ba Dum Tss', emoji: '🥁' },
  '7': { name: 'Horn', emoji: '📢' },
  '8': { name: 'GG', emoji: '🎮' },
  '9': { name: 'Fast Cap', emoji: '🧢' }
};

/**
 * Core handler to log a Soundboard sound played in a Voice Channel
 */
async function logSoundboardPlayed({ guild, channelId, userId, soundId, soundVolume, emoji }) {
  if (!guild || !userId || !channelId) return;

  const dedupeKey = `${userId}_${soundId || 'effect'}_${channelId}`;
  const nowMs = Date.now();
  if (recentSoundboardLogs.has(dedupeKey)) return;
  recentSoundboardLogs.set(dedupeKey, nowMs);

  logger.info(`[Soundboard Log] Detected soundboard sound play in guild "${guild.name}" by user ID ${userId}`);

  const logChannel = resolveChannel(guild, config.channels.soundboardLogs, 'Soundboard Logs');
  if (!logChannel) {
    logger.warn(`[Soundboard Log] Soundboard sound played, but could not resolve log channel in "${guild.name}". Check if channel #soundboards-logs or #soundboard-logs exists!`);
    return;
  }

  let userTag = 'Unknown User';
  let avatarUrl = guild.iconURL({ dynamic: true });

  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) {
      userTag = member.user.tag;
      avatarUrl = member.user.displayAvatarURL({ dynamic: true, size: 256 });
    }
  } catch (_) {}

  let soundName = soundId ? `Sound (ID: ${soundId})` : 'Soundboard Effect';
  let emojiStr = '';

  if (emoji) {
    if (emoji.id) {
      emojiStr = emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
    } else if (emoji.name) {
      emojiStr = emoji.name;
    }
  }

  const soundIdStr = soundId != null ? String(soundId) : null;

  // 1. Check default Discord soundboard sounds
  if (soundIdStr && DEFAULT_SOUNDBOARD_SOUNDS[soundIdStr]) {
    const def = DEFAULT_SOUNDBOARD_SOUNDS[soundIdStr];
    soundName = def.name;
    if (!emojiStr) emojiStr = def.emoji;
  }
  // 2. Resolve custom sound name from GuildSoundboardSoundManager
  else if (guild.soundboardSounds && soundIdStr) {
    try {
      let soundObj = guild.soundboardSounds.cache.get(soundIdStr);
      if (!soundObj) {
        soundObj = await guild.soundboardSounds.fetch(soundIdStr).catch(() => null);
      }
      if (soundObj) {
        if (soundObj.name) soundName = soundObj.name;
        if (!emojiStr && soundObj.emoji) {
          if (soundObj.emoji.id) {
            emojiStr = soundObj.emoji.animated ? `<a:${soundObj.emoji.name}:${soundObj.emoji.id}>` : `<:${soundObj.emoji.name}:${soundObj.emoji.id}>`;
          } else if (soundObj.emoji.name) {
            emojiStr = soundObj.emoji.name;
          }
        }
      }
    } catch (_) {}
  }

  const volumePercent = soundVolume != null ? Math.round(soundVolume * 100) : 100;
  const unixTime = Math.floor(nowMs / 1000);

  const embed = new EmbedBuilder()
    .setTitle('🔊 Soundboard Sound Played')
    .setColor(config.colors.soundboardLog || 0x9B59B6)
    .setDescription(`<@${userId}> played soundboard sound **${soundName}** ${emojiStr} in <#${channelId}>`)
    .addFields(
      { name: '👤 User', value: `<@${userId}> (\`${userTag}\`)`, inline: true },
      { name: '🔊 Voice Channel', value: `<#${channelId}>`, inline: true },
      { name: '🎵 Sound Played', value: `${emojiStr} **${soundName}**`.trim(), inline: true },
      { name: '🔊 Volume', value: `\`${volumePercent}%\``, inline: true },
      { name: '🕒 Time', value: `<t:${unixTime}:F> (<t:${unixTime}:R>)`, inline: false }
    )
    .setThumbnail(avatarUrl)
    .setTimestamp()
    .setFooter({ text: `User ID: ${userId} | Channel ID: ${channelId}`, iconURL: avatarUrl });

  await logChannel.send({ embeds: [embed] }).then(() => {
    logger.info(`[Soundboard Log] Successfully sent soundboard play embed to #${logChannel.name} in guild "${guild.name}"`);
  }).catch((err) => {
    logger.error(`Failed to send Soundboard log in #${logChannel.name}: ${err.message}`);
  });
}

/**
 * Core handler to log Soundboard sound creation
 */
async function logSoundboardCreated({ guild, soundId, name, emojiName, emojiId, creatorId }) {
  if (!guild) return;

  const dedupeKey = `create_${soundId}_${guild.id}`;
  if (recentSoundboardLogs.has(dedupeKey)) return;
  recentSoundboardLogs.set(dedupeKey, Date.now());

  logger.info(`[Soundboard Log] Detected soundboard sound creation "${name}" in guild "${guild.name}"`);

  const logChannel = resolveChannel(guild, config.channels.soundboardLogs, 'Soundboard Logs');
  if (!logChannel) return;

  const emojiStr = emojiId ? `<:${emojiName}:${emojiId}>` : (emojiName || '');
  const unixTime = Math.floor(Date.now() / 1000);
  const creatorMention = creatorId ? `<@${creatorId}>` : 'Unknown Administrator';

  const embed = new EmbedBuilder()
    .setTitle('➕ Soundboard Sound Added')
    .setColor(0x2ECC71)
    .setDescription(`New soundboard sound **${name}** ${emojiStr} was created by ${creatorMention}`)
    .addFields(
      { name: '🎵 Sound Name', value: `${emojiStr} **${name}**`.trim(), inline: true },
      { name: '🆔 Sound ID', value: `\`${soundId}\``, inline: true },
      { name: '👤 Created By', value: creatorMention, inline: true },
      { name: '🕒 Created At', value: `<t:${unixTime}:F>`, inline: false }
    )
    .setTimestamp();

  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

/**
 * Core handler to log Soundboard sound deletion
 */
async function logSoundboardDeleted({ guild, soundId, name }) {
  if (!guild) return;

  const dedupeKey = `delete_${soundId}_${guild.id}`;
  if (recentSoundboardLogs.has(dedupeKey)) return;
  recentSoundboardLogs.set(dedupeKey, Date.now());

  logger.info(`[Soundboard Log] Detected soundboard sound deletion "${name || soundId}" in guild "${guild.name}"`);

  const logChannel = resolveChannel(guild, config.channels.soundboardLogs, 'Soundboard Logs');
  if (!logChannel) return;

  const unixTime = Math.floor(Date.now() / 1000);

  const embed = new EmbedBuilder()
    .setTitle('🗑️ Soundboard Sound Removed')
    .setColor(0xE74C3C)
    .setDescription(`Soundboard sound **${name || soundId}** was removed from the server`)
    .addFields(
      { name: '🎵 Sound Name', value: `**${name || 'Unknown'}**`, inline: true },
      { name: '🆔 Sound ID', value: `\`${soundId}\``, inline: true },
      { name: '🕒 Removed At', value: `<t:${unixTime}:F>`, inline: false }
    )
    .setTimestamp();

  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = {
  name: 'raw',
  async execute(packet, client) {
    try {
      // Attach native discord.js event listeners if not already attached
      if (client && !client._soundboardListenersAttached) {
        client._soundboardListenersAttached = true;

        client.on(Events.VoiceChannelEffectSend || 'voiceChannelEffectSend', (effect) => {
          if (!effect || !effect.guild) return;
          logSoundboardPlayed({
            guild: effect.guild,
            channelId: effect.channelId,
            userId: effect.userId,
            soundId: effect.soundId || effect.soundboardSound?.soundId,
            soundVolume: effect.soundVolume,
            emoji: effect.emoji
          }).catch(() => {});
        });

        client.on(Events.GuildSoundboardSoundCreate || 'guildSoundboardSoundCreate', (sound) => {
          if (!sound || !sound.guild) return;
          logSoundboardCreated({
            guild: sound.guild,
            soundId: sound.soundId || sound.id,
            name: sound.name,
            emojiName: sound.emoji?.name,
            emojiId: sound.emoji?.id,
            creatorId: sound.author?.id || sound.user?.id
          }).catch(() => {});
        });

        client.on(Events.GuildSoundboardSoundDelete || 'guildSoundboardSoundDelete', (sound) => {
          if (!sound || !sound.guild) return;
          logSoundboardDeleted({
            guild: sound.guild,
            soundId: sound.soundId || sound.id,
            name: sound.name
          }).catch(() => {});
        });
      }

      if (!packet || !packet.t || !packet.d) return;

      const eventType = packet.t;
      const data = packet.d;

      // 1. Soundboard Sound Played in VC
      if (eventType === 'VOICE_CHANNEL_EFFECT_SEND') {
        const { guild_id, channel_id, user_id, sound_id, sound_volume, emoji } = data;
        if (!guild_id || !user_id || !channel_id) return;

        const guild = client.guilds.cache.get(guild_id);
        if (!guild) return;

        await logSoundboardPlayed({
          guild,
          channelId: channel_id,
          userId: user_id,
          soundId: sound_id,
          soundVolume: sound_volume,
          emoji
        });
      }

      // 2. Soundboard Sound Created
      else if (eventType === 'GUILD_SOUNDBOARD_SOUND_CREATE') {
        const { guild_id, sound_id, name, emoji_name, emoji_id, user } = data;
        const guild = client.guilds.cache.get(guild_id);
        if (!guild) return;

        await logSoundboardCreated({
          guild,
          soundId: sound_id,
          name,
          emojiName: emoji_name,
          emojiId: emoji_id,
          creatorId: user?.id
        });
      }

      // 3. Soundboard Sound Deleted
      else if (eventType === 'GUILD_SOUNDBOARD_SOUND_DELETE') {
        const { guild_id, sound_id, name } = data;
        const guild = client.guilds.cache.get(guild_id);
        if (!guild) return;

        await logSoundboardDeleted({
          guild,
          soundId: sound_id,
          name
        });
      }
    } catch (err) {
      logger.error(`Error in soundboardLog raw event handler: ${err.message}`);
    }
  }
};
