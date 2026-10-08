const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType
} = require('discord.js');
const logger = require('./logger');

// Store active presence state in memory
let currentPresenceState = {
  status: 'online', // 'online' | 'idle' | 'dnd' | 'invisible'
  activityType: ActivityType.Listening,
  activityName: 'Music | /play'
};

/**
 * Builds the Status Control Embed and 3 Dropdown Select Menus (+ Custom Text Button).
 * @param {import('discord.js').Client} client
 */
function buildStatusControlPanel(client) {
  const statusEmojiMap = {
    online: '🟢 Online',
    idle: '🌙 Idle',
    dnd: '⛔ Do Not Disturb',
    invisible: '🔘 Invisible (Offline)'
  };

  const activityTypeMap = {
    [ActivityType.Playing]: '🎮 Playing',
    [ActivityType.Listening]: '🎧 Listening to',
    [ActivityType.Watching]: '📺 Watching',
    [ActivityType.Competing]: '🏆 Competing in',
    [ActivityType.Streaming]: '📡 Streaming'
  };

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('⚙️ Bot Presence & Status Manager')
    .setDescription('Select options from the 3 dropdown menus below to update the bot\'s live presence, status mode, and activity text.')
    .addFields(
      { name: '🟢 Presence Status', value: `\`${statusEmojiMap[currentPresenceState.status] || currentPresenceState.status}\``, inline: true },
      { name: '🎭 Activity Type', value: `\`${activityTypeMap[currentPresenceState.activityType] || 'None'}\``, inline: true },
      { name: '💬 Activity Text', value: `\`${currentPresenceState.activityName || '(None)'}\``, inline: false }
    )
    .setFooter({ text: 'Changes take effect instantly on Discord gateway.' })
    .setTimestamp();

  // Dropdown 1: Presence Mode (Online, Idle, DND, Invisible)
  const selectStatus = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('select_bot_status_presence')
      .setPlaceholder('🟢 Select Presence Status (Online / Idle / DND / Invisible)')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Online')
          .setValue('online')
          .setDescription('Bot appears active with green indicator')
          .setEmoji('🟢')
          .setDefault(currentPresenceState.status === 'online'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Idle')
          .setValue('idle')
          .setDescription('Bot appears away with yellow crescent indicator')
          .setEmoji('🌙')
          .setDefault(currentPresenceState.status === 'idle'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Do Not Disturb')
          .setValue('dnd')
          .setDescription('Bot appears busy with red indicator')
          .setEmoji('⛔')
          .setDefault(currentPresenceState.status === 'dnd'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Invisible')
          .setValue('invisible')
          .setDescription('Bot appears offline (grey circle)')
          .setEmoji('🔘')
          .setDefault(currentPresenceState.status === 'invisible')
      )
  );

  // Dropdown 2: Activity Type (Playing, Listening, Watching, Competing, Streaming)
  const selectActivityType = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('select_bot_status_activity_type')
      .setPlaceholder('🎭 Select Activity Type (Listening / Playing / Watching...)')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Listening to')
          .setValue(String(ActivityType.Listening))
          .setDescription('Displays "Listening to <text>"')
          .setEmoji('🎧')
          .setDefault(currentPresenceState.activityType === ActivityType.Listening),
        new StringSelectMenuOptionBuilder()
          .setLabel('Playing')
          .setValue(String(ActivityType.Playing))
          .setDescription('Displays "Playing <text>"')
          .setEmoji('🎮')
          .setDefault(currentPresenceState.activityType === ActivityType.Playing),
        new StringSelectMenuOptionBuilder()
          .setLabel('Watching')
          .setValue(String(ActivityType.Watching))
          .setDescription('Displays "Watching <text>"')
          .setEmoji('📺')
          .setDefault(currentPresenceState.activityType === ActivityType.Watching),
        new StringSelectMenuOptionBuilder()
          .setLabel('Competing in')
          .setValue(String(ActivityType.Competing))
          .setDescription('Displays "Competing in <text>"')
          .setEmoji('🏆')
          .setDefault(currentPresenceState.activityType === ActivityType.Competing),
        new StringSelectMenuOptionBuilder()
          .setLabel('Streaming')
          .setValue(String(ActivityType.Streaming))
          .setDescription('Displays "Streaming <text>"')
          .setEmoji('📡')
          .setDefault(currentPresenceState.activityType === ActivityType.Streaming)
      )
  );

  // Dropdown 3: Preset Activity Text
  const selectPresetText = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('select_bot_status_preset_text')
      .setPlaceholder('💬 Select Preset Status Text (or use Custom button below)')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Music | /play')
          .setValue('Music | /play')
          .setDescription('Displays "Listening to Music | /play"')
          .setEmoji('🎵'),
        new StringSelectMenuOptionBuilder()
          .setLabel('VX OFFICIAL Bot')
          .setValue('VX OFFICIAL Bot')
          .setDescription('Displays "VX OFFICIAL Bot"')
          .setEmoji('🛡️'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Use /play for Music | /dm for Admin')
          .setValue('Use /play for Music | /dm for Admin')
          .setDescription('Displays help instructions')
          .setEmoji('💬'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Online & Ready')
          .setValue('Online & Ready')
          .setDescription('Displays "Online & Ready"')
          .setEmoji('🟢'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Clear Status Text')
          .setValue('preset_clear')
          .setDescription('Remove activity text completely')
          .setEmoji('❌')
      )
  );

  // Row 4: Custom Text Modal Button
  const customButtonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_bot_custom_status_modal')
      .setLabel('✏️ Set Custom Status Text')
      .setStyle(ButtonStyle.Primary)
  );

  return {
    embeds: [embed],
    components: [selectStatus, selectActivityType, selectPresetText, customButtonRow]
  };
}

/**
 * Apply presence updates to client user.
 * @param {import('discord.js').Client} client
 */
function applyBotPresence(client) {
  try {
    const activities = currentPresenceState.activityName
      ? [
          {
            name: currentPresenceState.activityName,
            type: Number(currentPresenceState.activityType)
          }
        ]
      : [];

    client.user.setPresence({
      status: currentPresenceState.status,
      activities
    });

    logger.info(`Updated Bot Presence: Status=${currentPresenceState.status}, ActivityType=${currentPresenceState.activityType}, Text="${currentPresenceState.activityName}"`);
    return true;
  } catch (err) {
    logger.error(`Failed to set bot presence: ${err.message}`);
    return false;
  }
}

module.exports = {
  currentPresenceState,
  buildStatusControlPanel,
  applyBotPresence
};
