const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  AttachmentBuilder
} = require('discord.js');
const config = require('../config');
const logger = require('./logger');
const { resolveChannel } = require('./channelHelper');
const { resolveRole } = require('./roleHelper');
const { formatUserTag } = require('./formatters');

// Ticket counter per guild (in-memory, fallback to random if reset)
let ticketCounter = 1;

/**
 * Deploys the Ticket System V2 Panel in the target support channel.
 * @param {import('discord.js').TextChannel} channel 
 */
async function deployTicketPanel(channel) {
  if (!channel) return false;

  const embed = new EmbedBuilder()
    .setColor(config.colors.primary || 0x5865F2)
    .setTitle(`🎫 ${config.serverName} | TICKET SYSTEM V2`)
    .setDescription(
      `Welcome to **${config.serverName} Support Center**!\n\n` +
      `If you need assistance, have questions, or want to make a purchase, select a category from the dropdown menu below to open a private ticket.\n\n` +
      `**Available Categories:**\n` +
      `• 💬 **General Support** — General questions & assistance\n` +
      `• 🛠️ **Technical Support** — Help with scripts, maps, or setup\n` +
      `• 💳 **Billing & Purchases** — Store & payment inquiries\n` +
      `• 🚨 **Report Issue** — Report a player or bug\n\n` +
      `*Our support team will be notified immediately upon ticket creation.*`
    )
    .setFooter({ text: `${config.serverName} • Support Tickets V2`, iconURL: channel.guild.iconURL() })
    .setTimestamp();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('ticket_select_category')
    .setPlaceholder('📩 Select ticket category...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('General Support')
        .setValue('general')
        .setDescription('Questions, feedback, or general help')
        .setEmoji('💬'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Technical Support')
        .setValue('technical')
        .setDescription('Script, mapping, or server issues')
        .setEmoji('🛠️'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Billing & Purchases')
        .setValue('billing')
        .setDescription('Payment, store, or license support')
        .setEmoji('💳'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Report Issue / Player')
        .setValue('report')
        .setDescription('Report a rule breaker or bug')
        .setEmoji('🚨')
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);

  try {
    await channel.send({ embeds: [embed], components: [row] });
    logger.success(`[${channel.guild.name}] Deployed Ticket System V2 panel in #${channel.name}`);
    return true;
  } catch (err) {
    logger.error(`[${channel.guild.name}] Failed to deploy ticket panel: ${err.message}`);
    return false;
  }
}

/**
 * Handles creation of a private ticket channel when a user selects a category.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction 
 */
async function handleTicketCreate(interaction) {
  const categoryValue = interaction.values[0];
  const guild = interaction.guild;
  const user = interaction.user;
  const member = interaction.member;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Check if user already has an open ticket
  const existingTicket = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name.startsWith('ticket-') && c.topic && c.topic.includes(user.id)
  );

  if (existingTicket) {
    return interaction.editReply({
      content: `⚠️ You already have an open ticket in ${existingTicket}! Please use that channel or close it before opening a new one.`
    });
  }

  // Find or Create TICKETS Category
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && (c.name.toUpperCase().includes('TICKET') || c.name.toUpperCase().includes('SUPPORT'))
  );

  if (!category) {
    try {
      category = await guild.channels.create({
        name: 'TICKETS',
        type: ChannelType.GuildCategory
      });
    } catch (err) {
      logger.warn(`Could not create TICKETS category: ${err.message}`);
    }
  }

  // Resolve support roles
  const supportRoles = [];
  const roleNamesToFind = ['Tickets v2', 'Tickets Support', 'Tickets Admin', 'Staff', 'Admin', 'Management'];
  for (const rName of roleNamesToFind) {
    const r = resolveRole(guild, { name: rName });
    if (r) supportRoles.push(r);
  }

  // Prepare permission overwrites
  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory
      ]
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ];

  for (const r of supportRoles) {
    permissionOverwrites.push({
      id: r.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  const categoryLabels = {
    general: '💬 General Support',
    technical: '🛠️ Technical Support',
    billing: '💳 Billing & Purchases',
    report: '🚨 Report Issue'
  };

  const formattedNum = String(ticketCounter++).padStart(4, '0');
  const channelName = `ticket-${formattedNum}`;

  try {
    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category ? category.id : null,
      topic: `Ticket Creator: ${user.tag} (ID: ${user.id}) | Category: ${categoryValue}`,
      permissionOverwrites
    });

    const categoryTitle = categoryLabels[categoryValue] || 'Support Ticket';

    const welcomeEmbed = new EmbedBuilder()
      .setColor(config.colors.primary || 0x5865F2)
      .setAuthor({ name: `${user.tag}'s Ticket`, iconURL: user.displayAvatarURL({ dynamic: true }) })
      .setTitle(`🎫 Ticket ${channelName.toUpperCase()} — ${categoryTitle}`)
      .setDescription(
        `Welcome ${user}! Thanks for contacting **${config.serverName} Support**.\n\n` +
        `Please describe your issue or question in detail below. A member of our support team will assist you shortly.\n\n` +
        `**Ticket Information:**\n` +
        `• **User:** ${user} (\`${user.id}\`)\n` +
        `• **Category:** ${categoryTitle}\n` +
        `• **Opened At:** <t:${Math.floor(Date.now() / 1000)}:F>`
      )
      .setFooter({ text: 'Use the control buttons below to manage this ticket.' })
      .setTimestamp();

    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_btn_claim')
        .setLabel('Claim Ticket')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✋'),
      new ButtonBuilder()
        .setCustomId('ticket_btn_close')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔒'),
      new ButtonBuilder()
        .setCustomId('ticket_btn_transcript')
        .setLabel('Save Transcript')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📄'),
      new ButtonBuilder()
        .setCustomId('ticket_btn_delete')
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
    );

    const pingText = supportRoles.length > 0 ? supportRoles.map((r) => r.toString()).join(' ') : '@here';
    const pingMsg = await ticketChannel.send({ content: `🔔 ${pingText}` });
    await pingMsg.delete().catch(() => {});
    await ticketChannel.send({ embeds: [welcomeEmbed], components: [controlRow] });

    logger.success(`[${guild.name}] Created ticket channel ${ticketChannel.name} for ${user.tag}`);
    return interaction.editReply({
      content: `✅ Ticket created successfully! Head over to ${ticketChannel}`
    });
  } catch (err) {
    logger.error(`Failed to create ticket channel: ${err.message}`);
    return interaction.editReply({
      content: `❌ Failed to create ticket channel: ${err.message}`
    });
  }
}

/**
 * Handles claiming a ticket by a staff member.
 * @param {import('discord.js').ButtonInteraction} interaction 
 */
async function handleTicketClaim(interaction) {
  const { channel, user, guild } = interaction;

  await interaction.deferReply();

  const embed = new EmbedBuilder()
    .setColor(0x2ECC71)
    .setDescription(`✋ **Ticket Claimed!**\nThis ticket has been claimed by ${user}. They will be handling your request!`)
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  return interaction.editReply({ content: `✅ You have claimed ticket #${channel.name}` });
}

/**
 * Helper to generate and post transcript to the transcript log channel.
 * @param {import('discord.js').TextChannel} channel 
 * @param {import('discord.js').Guild} guild 
 * @param {import('discord.js').User} user 
 * @param {string} actionName 'Closed' or 'Exported' or 'Deleted'
 * @returns {Promise<import('discord.js').TextChannel|null>}
 */
async function generateAndSaveTranscript(channel, guild, user, actionName = 'Closed') {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    let transcriptContent = `==================================================\n`;
    transcriptContent += `TICKET TRANSCRIPT: #${channel.name}\n`;
    transcriptContent += `Server: ${guild.name}\n`;
    transcriptContent += `${actionName} By: ${user.tag} (${user.id})\n`;
    transcriptContent += `Date: ${new Date().toISOString()}\n`;
    transcriptContent += `Topic: ${channel.topic || 'N/A'}\n`;
    transcriptContent += `==================================================\n\n`;

    for (const m of sorted) {
      const timeStr = new Date(m.createdTimestamp).toLocaleString();
      const content = m.cleanContent || (m.embeds.length ? '[Embed Message]' : '[Attachment/Other]');
      transcriptContent += `[${timeStr}] ${m.author.tag}: ${content}\n`;
    }

    const buffer = Buffer.from(transcriptContent, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: `${channel.name}-transcript.txt` });

    const transcriptLogChannel = resolveChannel(guild, {
      names: ['transcript-logs', 'transcript-log', 'ticket-transcripts', 'tickets-v2', 'tickets-admin', 'admin-approval']
    }, 'Transcript Logs Channel');

    if (transcriptLogChannel) {
      const logEmbed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle(`📋 Ticket Transcript: #${channel.name}`)
        .setDescription(`Ticket ${actionName.toLowerCase()} by ${user}.\n**Channel Topic:** ${channel.topic || 'N/A'}`)
        .setFooter({ text: `${guild.name} • Ticket Logs` })
        .setTimestamp();

      await transcriptLogChannel.send({ embeds: [logEmbed], files: [attachment] });
      return transcriptLogChannel;
    }
  } catch (err) {
    logger.error(`Error generating transcript for #${channel.name}: ${err.message}`);
  }
  return null;
}

/**
 * Handles closing a ticket (disables user messaging permissions and auto-archives transcript).
 * @param {import('discord.js').ButtonInteraction} interaction 
 */
async function handleTicketClose(interaction) {
  const { channel, user, guild } = interaction;

  await interaction.deferReply();

  // Extract topic user ID if available
  const match = channel.topic ? channel.topic.match(/ID:\s*(\d+)/) : null;
  const creatorId = match ? match[1] : null;

  if (creatorId) {
    try {
      await channel.permissionOverwrites.edit(creatorId, {
        SendMessages: false,
        AddReactions: false
      });
    } catch (err) {
      logger.warn(`Could not restrict creator send permissions: ${err.message}`);
    }
  }

  // Auto-generate transcript and send to #transcript-logs
  const archiveChan = await generateAndSaveTranscript(channel, guild, user, 'Closed');

  const embed = new EmbedBuilder()
    .setColor(0xE74C3C)
    .setTitle('🔒 Ticket Closed')
    .setDescription(
      `This ticket was closed by ${user}.\n\n` +
      `📄 **Transcript Archived:** ${archiveChan ? `Saved to ${archiveChan}` : 'Saved to log channel.'}\n` +
      `Ticket channel is now locked for members.`
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_btn_transcript')
      .setLabel('Download Transcript')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📄'),
    new ButtonBuilder()
      .setCustomId('ticket_btn_delete')
      .setLabel('Delete Channel')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️')
  );

  await channel.send({ embeds: [embed], components: [row] });
  return interaction.editReply({ content: `🔒 Ticket marked as closed and transcript archived.` });
}

/**
 * Generates and uploads chat transcript to #transcript-logs channel or DM.
 * @param {import('discord.js').ButtonInteraction} interaction 
 */
async function handleTicketTranscript(interaction) {
  const { channel, guild, user } = interaction;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const archiveChan = await generateAndSaveTranscript(channel, guild, user, 'Exported');

  return interaction.editReply({
    content: `✅ Transcript generated successfully! ${archiveChan ? `Archived in ${archiveChan}.` : ''}`
  });
}

/**
 * Handles deletion of a ticket channel with a short countdown timer.
 * @param {import('discord.js').ButtonInteraction} interaction 
 */
async function handleTicketDelete(interaction) {
  const { channel, guild, user } = interaction;

  await interaction.reply({ content: '🗑️ Ticket channel will be deleted in 5 seconds...' });

  await generateAndSaveTranscript(channel, guild, user, 'Deleted');

  setTimeout(async () => {
    try {
      await channel.delete('Ticket closed and deleted by staff.');
    } catch (err) {
      logger.error(`Failed to delete ticket channel: ${err.message}`);
    }
  }, 5000);
}

/**
 * Adds a target user to the current ticket channel.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction 
 */
async function handleTicketAddMember(interaction) {
  const { channel } = interaction;
  const targetUser = interaction.options.getUser('user', true);

  if (!channel.name.startsWith('ticket-')) {
    return interaction.reply({
      content: '❌ This command can only be used inside an active ticket channel!',
      flags: MessageFlags.Ephemeral
    });
  }

  await interaction.deferReply();

  try {
    await channel.permissionOverwrites.edit(targetUser.id, {
      ViewChannel: true,
      SendMessages: true,
      EmbedLinks: true,
      AttachFiles: true,
      ReadMessageHistory: true
    });

    const embed = new EmbedBuilder()
      .setColor(0x2ECC71)
      .setDescription(`✅ **User Added:** ${targetUser} has been added to this ticket by ${interaction.user}.`)
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    return interaction.editReply({ content: `❌ Failed to add user to ticket: ${err.message}` });
  }
}

/**
 * Removes a target user from the current ticket channel.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction 
 */
async function handleTicketRemoveMember(interaction) {
  const { channel } = interaction;
  const targetUser = interaction.options.getUser('user', true);

  if (!channel.name.startsWith('ticket-')) {
    return interaction.reply({
      content: '❌ This command can only be used inside an active ticket channel!',
      flags: MessageFlags.Ephemeral
    });
  }

  await interaction.deferReply();

  try {
    await channel.permissionOverwrites.delete(targetUser.id);

    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setDescription(`❌ **User Removed:** ${targetUser} has been removed from this ticket by ${interaction.user}.`)
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    return interaction.editReply({ content: `❌ Failed to remove user from ticket: ${err.message}` });
  }
}

module.exports = {
  deployTicketPanel,
  handleTicketCreate,
  handleTicketClaim,
  handleTicketClose,
  handleTicketTranscript,
  handleTicketDelete,
  handleTicketAddMember,
  handleTicketRemoveMember
};
