const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType
} = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const { resolveChannel, styleAllChannels } = require('../utils/channelHelper');
const { resolveRole, safelyAddRole, safelyRemoveRole } = require('../utils/roleHelper');
const { deployRolesPanel } = require('../utils/rolesPanel');
const { formatUserTag, toSmallCaps } = require('../utils/formatters');
const {
  resolveVoiceChannelW,
  setOwner,
  isAllowed,
  addAllowedUser,
  removeAllowedUser,
  getAllowedUsers,
  syncChannelPermissions
} = require('../utils/privateVoiceHelper');
const { getMusicPlayer, buildMusicControlRows } = require('../utils/musicPlayer');
const {
  buildStatusControlPanel,
  applyBotPresence,
  currentPresenceState
} = require('../utils/statusHelper');
const {
  deployTicketPanel,
  handleTicketCreate,
  handleTicketClaim,
  handleTicketClose,
  handleTicketTranscript,
  handleTicketDelete,
  handleTicketAddMember,
  handleTicketRemoveMember
} = require('../utils/ticketHelper');

// In-memory set to prevent spamming duplicate pending requests while bot is running
const pendingCrewRequests = new Set();
const pendingMagneraRequests = new Set();

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // ==========================================
    // Handle Modal Submissions
    // ==========================================
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('modal_reply_dm_')) {
        const targetUserId = interaction.customId.replace('modal_reply_dm_', '');
        const replyText = interaction.fields.getTextInputValue('reply_text_input');

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
        if (!targetUser) {
          return interaction.editReply({
            content: '❌ User could not be found or fetched.'
          });
        }

        try {
          // Send plain text message directly to user's DMs
          await targetUser.send(replyText);

          // Log sent reply in #dms channel
          const replyLogEmbed = new EmbedBuilder()
            .setColor(config.colors.joinLog)
            .setAuthor({
              name: `Reply Sent to ${formatUserTag(targetUser)}`,
              iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setDescription(`💬 **Reply sent by ${interaction.user}:**\n> ${replyText.replace(/\n/g, '\n> ')}`)
            .setFooter({ text: `Target User ID: ${targetUserId}` })
            .setTimestamp();

          await interaction.channel.send({ embeds: [replyLogEmbed] });

          logger.success(`Admin ${interaction.user.tag} sent DM reply to ${targetUser.tag}`);
          return interaction.editReply({
            content: `✅ Successfully sent DM reply to **${formatUserTag(targetUser)}**!`
          });
        } catch (err) {
          logger.error(`Failed to send DM to ${targetUser.tag}: ${err.message}`);
          return interaction.editReply({
            content: `❌ Could not send DM to **${formatUserTag(targetUser)}**. They may have Direct Messages disabled or blocked the bot.`
          });
        }
      }

      if (interaction.customId === 'modal_bot_custom_status') {
        const text = interaction.fields.getTextInputValue('custom_status_input');
        currentPresenceState.activityName = text.trim();
        applyBotPresence(interaction.client);

        return interaction.reply({
          content: `✅ Successfully set bot activity text to: \`${text.trim() || '(Cleared)'}\``,
          flags: MessageFlags.Ephemeral
        });
      }

      return;
    }

    // ==========================================
    // Handle /setup-roles and /clear-chat Slash Commands
    // ==========================================
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'setup-roles') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let targetChannel = null;
        if (
          config.channels.roles.names.some(
            (name) => name.toLowerCase() === interaction.channel.name.toLowerCase()
          )
        ) {
          targetChannel = interaction.channel;
        } else {
          targetChannel = resolveChannel(interaction.guild, config.channels.roles, 'Roles Channel');
        }

        if (!targetChannel) {
          return interaction.editReply(
            `⚠️ Could not find the roles channel (searched for \`#${config.channels.roles.names[0]}\`). Please create a channel named \`#roles\` first or run this command directly inside it!`
          );
        }

        const deployed = await deployRolesPanel(targetChannel);
        if (deployed) {
          return interaction.editReply(`✅ Roles selection panel successfully deployed to ${targetChannel}!`);
        } else {
          return interaction.editReply(`⚠️ Failed to deploy role panel. Please verify bot permissions in ${targetChannel}.`);
        }
      }

      // ==========================================
      // Handle /setup-logs Slash Command
      // ==========================================
      if (interaction.commandName === 'setup-logs') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({
            content: '❌ You need Administrator permissions to run this command.',
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guild = interaction.guild;
        const botMember = guild.members.me;

        // 1. Find or Create LOGS! Category
        let category = guild.channels.cache.find(
          (c) => c.type === ChannelType.GuildCategory && (c.name.toUpperCase().includes('LOGS') || c.name.toUpperCase().includes('LOG'))
        );

        if (!category) {
          try {
            category = await guild.channels.create({
              name: 'LOGS!',
              type: ChannelType.GuildCategory,
              permissionOverwrites: [
                {
                  id: guild.roles.everyone.id,
                  deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                  id: botMember.id,
                  allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.ManageMessages,
                    PermissionFlagsBits.ReadMessageHistory
                  ]
                }
              ]
            });
          } catch (err) {
            return interaction.editReply(`❌ Failed to create LOGS! category: ${err.message}`);
          }
        }

        const logChannelsToSetup = [
          { key: 'exit-logs', name: 'exit-logs' },
          { key: 'join-logs', name: 'join-logs' },
          { key: 'invite-tracker', name: 'invite-tracker' },
          { key: 'voice-logs', name: 'voice-logs' },
          { key: 'deletd-message-logs', name: 'deletd-message-logs' },
          { key: 'account-logs', name: 'account-logs' }
        ];

        const results = [];

        for (const logChan of logChannelsToSetup) {
          let existing = guild.channels.cache.find(
            (c) => c.type === ChannelType.GuildText && (c.name.toLowerCase() === logChan.name || c.name.toLowerCase().includes(logChan.key))
          );

          if (!existing) {
            try {
              existing = await guild.channels.create({
                name: logChan.name,
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites: [
                  {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                  },
                  {
                    id: botMember.id,
                    allow: [
                      PermissionFlagsBits.ViewChannel,
                      PermissionFlagsBits.SendMessages,
                      PermissionFlagsBits.EmbedLinks,
                      PermissionFlagsBits.AttachFiles,
                      PermissionFlagsBits.ManageMessages,
                      PermissionFlagsBits.ReadMessageHistory
                    ]
                  }
                ]
              });
              results.push(`✅ Created **#${existing.name}** under **${category.name}** (Private)`);
            } catch (err) {
              results.push(`❌ Failed to create **#${logChan.name}**: ${err.message}`);
            }
          } else {
            try {
              if (category && existing.parentId !== category.id) {
                await existing.setParent(category.id, { lockPermissions: false });
              }
              await existing.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false });
              await existing.permissionOverwrites.edit(botMember.id, {
                ViewChannel: true,
                SendMessages: true,
                EmbedLinks: true,
                AttachFiles: true,
                ManageMessages: true,
                ReadMessageHistory: true
              });
              results.push(`🔒 Configured **#${existing.name}** as Private (Bot Access Granted)`);
            } catch (err) {
              results.push(`⚠️ Updated **#${existing.name}** with warnings: ${err.message}`);
            }
          }
        }

        return interaction.editReply({
          content: `📁 **LOGS! Setup Complete!**\n\n` + results.join('\n')
        });
      }

      // ==========================================
      // Handle /setup-tickets Slash Command
      // ==========================================
      if (interaction.commandName === 'setup-tickets') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({
            content: '❌ You need "Manage Channels" or Administrator permissions to use this command.',
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let targetChannel = null;
        if (interaction.channel.name.toLowerCase().includes('ticket')) {
          targetChannel = interaction.channel;
        } else {
          targetChannel = resolveChannel(interaction.guild, { names: ['ticket', 'tickets', 'support-ticket', 'get-ticket'] }, 'Ticket Channel');
        }

        if (!targetChannel) {
          targetChannel = interaction.channel;
        }

        const deployed = await deployTicketPanel(targetChannel);
        if (deployed) {
          return interaction.editReply(`✅ Ticket System V2 panel successfully deployed to ${targetChannel}!`);
        } else {
          return interaction.editReply(`⚠️ Failed to deploy ticket panel. Please verify bot permissions in ${targetChannel}.`);
        }
      }

      // ==========================================
      // Handle /add and /remove Ticket Slash Commands
      // ==========================================
      if (interaction.commandName === 'add') {
        return handleTicketAddMember(interaction);
      }

      if (interaction.commandName === 'remove') {
        return handleTicketRemoveMember(interaction);
      }

      // ==========================================
      // Handle /clear-chat Slash Command
      // ==========================================
      if (interaction.commandName === 'clear-chat') {
        if (
          !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) &&
          !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
        ) {
          return interaction.reply({
            content: '❌ You must have "Manage Messages" or Administrator permissions to use this command.',
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const amount = interaction.options.getInteger('amount') || 100;

        try {
          const deleted = await interaction.channel.bulkDelete(amount, true);

          if (deleted.size === 0) {
            return interaction.editReply(
              '⚠️ No messages were deleted. (Note: Messages older than 14 days cannot be bulk deleted due to Discord API limitations).'
            );
          }

          logger.info(`[${interaction.guild.name}] ${interaction.user.tag} cleared ${deleted.size} messages in #${interaction.channel.name}`);
          return interaction.editReply(
            `🧹 Successfully deleted **${deleted.size}** message(s) in ${interaction.channel}!`
          );
        } catch (err) {
          logger.error(`[${interaction.guild.name}] Error running /clear-chat: ${err.message}`);
          return interaction.editReply(
            `⚠️ Failed to clear messages: ${err.message}`
          );
        }
      }

      // ==========================================
      // Handle /dm Slash Command
      // ==========================================
      if (interaction.commandName === 'dm') {
        if (
          !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) &&
          !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
        ) {
          return interaction.reply({
            content: '❌ You must have "Manage Messages" or Administrator permissions to use this command.',
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const targetUser = interaction.options.getUser('user');
        const targetRole = interaction.options.getRole('role');
        const dmContent = interaction.options.getString('message');

        if (!targetUser && !targetRole) {
          return interaction.editReply('❌ You must specify at least a **user** or a **role** to send a DM to.');
        }

        // Gather all target users (deduplicated)
        const targetUsersMap = new Map();

        if (targetUser) {
          targetUsersMap.set(targetUser.id, targetUser);
        }

        if (targetRole) {
          // Fetch members if role members cache might be incomplete
          await interaction.guild.members.fetch().catch((err) => {
            logger.warn(`[${interaction.guild.name}] Failed to fetch all guild members for role DM: ${err.message}`);
          });

          const roleMembers = targetRole.members.filter((m) => !m.user.bot);
          for (const [, member] of roleMembers) {
            targetUsersMap.set(member.user.id, member.user);
          }
        }

        if (targetUsersMap.size === 0) {
          return interaction.editReply('❌ No eligible non-bot users were found to send a DM to.');
        }

        let successCount = 0;
        let failCount = 0;
        const failedUsers = [];

        for (const [, userToDm] of targetUsersMap) {
          try {
            await userToDm.send(dmContent);
            successCount++;
          } catch (err) {
            failCount++;
            failedUsers.push(formatUserTag(userToDm));
            logger.error(`[${interaction.guild.name}] Failed to send DM to ${userToDm.tag}: ${err.message}`);
          }
        }

        // Log outgoing DM in #dms channel if found
        const dmsChannel = resolveChannel(interaction.guild, config.channels.dms, 'DMs Channel');
        if (dmsChannel) {
          let targetText = '';
          if (targetUser && targetRole) {
            targetText = `User: ${targetUser} (\`${formatUserTag(targetUser)}\`) | Role: ${targetRole}`;
          } else if (targetUser) {
            targetText = `User: ${targetUser} (\`${formatUserTag(targetUser)}\`)`;
          } else {
            targetText = `Role: ${targetRole} (${targetRole.name})`;
          }

          const replyLogEmbed = new EmbedBuilder()
            .setColor(config.colors.joinLog)
            .setAuthor({
              name: `DM Sent by ${interaction.user.username}`,
              iconURL: interaction.user.displayAvatarURL({ dynamic: true })
            })
            .setDescription(`💬 **Message sent by ${interaction.user}:**\n> ${dmContent.replace(/\n/g, '\n> ')}`)
            .addFields(
              { name: '🎯 Target', value: targetText, inline: false },
              { name: '📊 Delivery Status', value: `✅ Successful: **${successCount}** | ❌ Failed: **${failCount}**`, inline: false }
            )
            .setFooter({ text: `Total Recipients Targeted: ${targetUsersMap.size}` })
            .setTimestamp();

          await dmsChannel.send({ embeds: [replyLogEmbed] }).catch(() => null);
        }

        logger.success(`[${interaction.guild.name}] Admin ${interaction.user.tag} sent DM to ${targetUsersMap.size} user(s). Success: ${successCount}, Failed: ${failCount}`);

        if (targetUsersMap.size === 1 && targetUser && !targetRole) {
          if (successCount === 1) {
            return interaction.editReply(`✅ Successfully sent DM to ${targetUser} (\`${formatUserTag(targetUser)}\`)!`);
          } else {
            return interaction.editReply(`❌ Could not send DM to ${targetUser} (\`${formatUserTag(targetUser)}\`). They may have Direct Messages disabled or blocked the bot.`);
          }
        }

        let summaryMessage = `✅ **DM Process Completed!**\n• Successfully delivered to **${successCount}** member(s).`;
        if (failCount > 0) {
          summaryMessage += `\n• ❌ Failed to deliver to **${failCount}** member(s) (DMs disabled/blocked).`;
        }

        return interaction.editReply(summaryMessage);
      }

      // ==========================================
      // Handle /style-channels Slash Command
      // ==========================================
      if (interaction.commandName === 'style-channels') {
        if (
          !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) &&
          !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
        ) {
          return interaction.reply({
            content: '❌ You must have "Manage Channels" or Administrator permissions to use this command.',
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          const { updated, skipped } = await styleAllChannels(interaction.guild);
          return interaction.editReply({
            content: `✨ Successfully converted **${updated}** channel(s) & category(ies) to the **Small Caps** aesthetic font! (${skipped} already styled or skipped)`
          });
        } catch (err) {
          logger.error(`[${interaction.guild.name}] Error running /style-channels: ${err.message}`);
          return interaction.editReply({
            content: `⚠️ Failed to style channels: ${err.message}`
          });
        }
      }

      // ==========================================
      // Handle /private-vc Slash Command
      // ==========================================
      if (interaction.commandName === 'private-vc') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild;
        const voiceChannel = resolveVoiceChannelW(guild);

        if (!voiceChannel) {
          return interaction.editReply({
            content: `⚠️ Private voice channel **"w"** was not found on this server. Please create a voice channel named \`w\` first!`
          });
        }

        // Subcommand: claim
        if (subcommand === 'claim') {
          setOwner(guild.id, interaction.user.id);
          await syncChannelPermissions(guild);
          return interaction.editReply({
            content: `👑 You have successfully claimed ownership of private voice channel **#${voiceChannel.name}**! Only you and people you grant access to can join.`
          });
        }

        // Check if caller is authorized owner / allowed user / administrator to execute allow/deny
        const isCallerOwner = isAllowed(guild, interaction.user.id);
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isCallerOwner && !isAdmin && subcommand !== 'list') {
          return interaction.editReply({
            content: `❌ Only the designated owner or an authorized member of private voice channel **#${voiceChannel.name}** can manage access list!`
          });
        }

        // Subcommand: allow
        if (subcommand === 'allow') {
          const targetUser = interaction.options.getUser('user');
          if (targetUser.bot) {
            return interaction.editReply({ content: '⚠️ Bots do not need to be added to the access list.' });
          }

          const added = addAllowedUser(guild.id, targetUser.id);
          await syncChannelPermissions(guild);

          if (added) {
            logger.info(`[${guild.name}] ${interaction.user.tag} granted access to ${targetUser.tag} for private VC 'w'`);
            return interaction.editReply({
              content: `✅ Successfully granted access to ${targetUser} (\`${formatUserTag(targetUser)}\`) for private voice channel **#${voiceChannel.name}**!`
            });
          } else {
            return interaction.editReply({
              content: `ℹ️ ${targetUser} already has access to private voice channel **#${voiceChannel.name}**.`
            });
          }
        }

        // Subcommand: deny
        if (subcommand === 'deny') {
          const targetUser = interaction.options.getUser('user');
          const removed = removeAllowedUser(guild.id, targetUser.id);
          await syncChannelPermissions(guild);

          // Eject if currently inside channel 'w'
          const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
          if (targetMember && targetMember.voice.channelId === voiceChannel.id) {
            await targetMember.voice.setChannel(null).catch(() => {});
          }

          if (removed) {
            logger.info(`[${guild.name}] ${interaction.user.tag} revoked access from ${targetUser.tag} for private VC 'w'`);
            return interaction.editReply({
              content: `🚫 Successfully revoked access from ${targetUser} (\`${formatUserTag(targetUser)}\`) for private voice channel **#${voiceChannel.name}**!`
            });
          } else {
            return interaction.editReply({
              content: `ℹ️ ${targetUser} does not currently have access to private voice channel **#${voiceChannel.name}**.`
            });
          }
        }

        // Subcommand: list
        if (subcommand === 'list') {
          const { ownerId, allowedUsers } = getAllowedUsers(guild.id);
          const ownerText = ownerId ? `<@${ownerId}>` : '*(Not set - use `/private-vc claim`)*';
          
          let allowedListText = '*(None)*';
          if (allowedUsers.length > 0) {
            allowedListText = allowedUsers.map((id) => `• <@${id}> (\`${id}\`)`).join('\n');
          }

          const listEmbed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle(`🔒 Private Voice Channel Access List`)
            .setDescription(`Access control settings for voice channel **#${voiceChannel.name}**`)
            .addFields(
              { name: '👑 Owner / Primary', value: ownerText, inline: false },
              { name: '👥 Authorized Members', value: allowedListText, inline: false },
              { name: '🛡️ Security Policy', value: 'Any unauthorized user (including admins) attempting to join will be automatically ejected instantly.', inline: false }
            )
            .setTimestamp();

          return interaction.editReply({ embeds: [listEmbed] });
        }
      }

      // ==========================================
      // Handle Music Slash Commands (/play, /pause, /resume, /skip, /stop, /queue, /nowplaying, /volume)
      // ==========================================
      const musicCommands = ['play', 'pause', 'resume', 'skip', 'stop', 'queue', 'nowplaying', 'volume'];
      if (musicCommands.includes(interaction.commandName)) {
        const player = getMusicPlayer();
        if (!player) {
          return interaction.reply({
            content: '⚠️ Music player service is currently initializing. Please try again in a moment.',
            flags: MessageFlags.Ephemeral
          });
        }

        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
          return interaction.reply({
            content: '❌ You must be connected to a voice channel to use music commands!',
            flags: MessageFlags.Ephemeral
          });
        }

        const botMember = interaction.guild.members.me;
        if (botMember && voiceChannel.permissionsFor(botMember)) {
          const permissions = voiceChannel.permissionsFor(botMember);
          if (!permissions.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak)) {
            return interaction.reply({
              content: `❌ I do not have permission to **Connect** or **Speak** in **#${voiceChannel.name}**! Please check channel permissions for the bot.`,
              flags: MessageFlags.Ephemeral
            });
          }
        }

        // Handle /play command
        if (interaction.commandName === 'play') {
          await interaction.deferReply();
          const query = interaction.options.getString('query', true);

          try {
            const searchResult = await player.search(query, {
              requestedBy: interaction.user
            });

            if (!searchResult || !searchResult.hasTracks()) {
              return interaction.editReply({
                content: `⚠️ No playable tracks found for \`${query}\`. Please verify the link or try searching song keywords!`
              });
            }

            const trackToPlay = searchResult.playlist ? searchResult : searchResult.tracks[0];

            const { track } = await player.play(voiceChannel, trackToPlay, {
              requestedBy: interaction.user,
              nodeOptions: {
                metadata: {
                  channel: interaction.channel,
                  client: interaction.client,
                  requestedBy: interaction.user
                },
                leaveOnEmpty: true,
                leaveOnEmptyCooldown: 30000,
                leaveOnEnd: false,
                leaveOnEndCooldown: 60000,
                selfDeaf: true,
                bufferingTimeout: 30000,
                volume: 80
              }
            });

            const displayTitle = track.title || track.cleanTitle || track.raw?.title || 'Audio Track';
            const displayDuration = (track.duration && track.duration !== '0:00' && track.duration !== '00:00') ? track.duration : (track.raw?.duration || 'Unknown');
            const displayThumbnail = track.thumbnail || track.raw?.thumbnail || null;

            const embed = new EmbedBuilder()
              .setColor('#00ff7f')
              .setTitle(searchResult.playlist ? '📚 Playlist Loaded' : '🎵 Track Loaded')
              .setDescription(`[**${displayTitle}**](${track.url})`)
              .setThumbnail(displayThumbnail)
              .addFields(
                { name: 'Duration', value: displayDuration, inline: true },
                { name: 'Channel', value: `${voiceChannel.name}`, inline: true },
                { name: 'Requested By', value: `${interaction.user}`, inline: true }
              )
              .setTimestamp();

            return interaction.editReply({
              embeds: [embed],
              components: buildMusicControlRows(false)
            });
          } catch (err) {
            logger.error(`Error executing /play: ${err.message}`);
            return interaction.editReply({
              content: `❌ Could not play track: ${err.message || 'Failed to resolve link or join voice channel.'}`
            });
          }
        }

        const queue = player.nodes.get(interaction.guildId);

        // Handle /pause
        if (interaction.commandName === 'pause') {
          if (!queue || !queue.isPlaying()) {
            return interaction.reply({ content: '⚠️ No music is currently playing.', flags: MessageFlags.Ephemeral });
          }
          await interaction.deferReply();
          const isPaused = queue.node.isPaused();
          if (isPaused) {
            queue.node.resume();
            return interaction.editReply('▶️ Resumed music playback!');
          } else {
            queue.node.pause();
            return interaction.editReply('⏸️ Paused music playback!');
          }
        }

        // Handle /resume
        if (interaction.commandName === 'resume') {
          if (!queue) {
            return interaction.reply({ content: '⚠️ No music queue found.', flags: MessageFlags.Ephemeral });
          }
          await interaction.deferReply();
          queue.node.resume();
          return interaction.editReply('▶️ Resumed music playback!');
        }

        // Handle /skip
        if (interaction.commandName === 'skip') {
          if (!queue || !queue.isPlaying()) {
            return interaction.reply({ content: '⚠️ No song is currently playing to skip.', flags: MessageFlags.Ephemeral });
          }
          await interaction.deferReply();
          const skippedTrack = queue.currentTrack;
          queue.node.skip();
          return interaction.editReply(`⏭️ Skipped **${skippedTrack?.title || 'current song'}**!`);
        }

        // Handle /stop
        if (interaction.commandName === 'stop') {
          if (!queue) {
            return interaction.reply({ content: '⚠️ No active music player session to stop.', flags: MessageFlags.Ephemeral });
          }
          await interaction.deferReply();
          queue.delete();
          return interaction.editReply('⏹️ Stopped music playback, cleared queue, and left the voice channel.');
        }

        // Handle /queue
        if (interaction.commandName === 'queue') {
          if (!queue || !queue.isPlaying()) {
            return interaction.reply({ content: '⚠️ No music is currently playing.', flags: MessageFlags.Ephemeral });
          }
          await interaction.deferReply();
          const currentTrack = queue.currentTrack;
          const tracks = queue.tracks.data.slice(0, 10);

          let queueList = tracks.map((t, idx) => `**${idx + 1}.** [${t.title}](${t.url}) - \`${t.duration}\``).join('\n');
          if (queue.tracks.data.length > 10) {
            queueList += `\n*...and ${queue.tracks.data.length - 10} more track(s)*`;
          }

          const embed = new EmbedBuilder()
            .setColor('#1e90ff')
            .setTitle(`🎶 Music Queue - ${interaction.guild.name}`)
            .setDescription(`**Now Playing:**\n[**${currentTrack.title}**](${currentTrack.url}) - \`${currentTrack.duration}\`\n\n**Up Next:**\n${queueList || '*(No upcoming songs in queue)*'}`)
            .setFooter({ text: `Total songs: ${queue.tracks.data.length + 1}` })
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        }

        // Handle /nowplaying
        if (interaction.commandName === 'nowplaying') {
          if (!queue || !queue.isPlaying()) {
            return interaction.reply({ content: '⚠️ No music is currently playing.', flags: MessageFlags.Ephemeral });
          }
          await interaction.deferReply();
          const currentTrack = queue.currentTrack;
          const progressBar = queue.node.createProgressBar();

          const embed = new EmbedBuilder()
            .setColor('#00ff7f')
            .setTitle('🎵 Now Playing')
            .setDescription(`[**${currentTrack.title}**](${currentTrack.url})\n\nRequested by: ${currentTrack.requestedBy}\n\n${progressBar}`)
            .setThumbnail(currentTrack.thumbnail || null)
            .addFields(
              { name: 'Author / Artist', value: currentTrack.author || 'Unknown', inline: true },
              { name: 'Volume', value: `${queue.node.volume}%`, inline: true }
            )
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        }

        // Handle /volume
        if (interaction.commandName === 'volume') {
          if (!queue || !queue.isPlaying()) {
            return interaction.reply({ content: '⚠️ No music is currently playing.', flags: MessageFlags.Ephemeral });
          }
          await interaction.deferReply();
          const level = interaction.options.getInteger('level', true);
          queue.node.setVolume(level);
          return interaction.editReply(`🔊 Set playback volume to **${level}%**!`);
        }
      }

      // ==========================================
      // Handle /status Slash Command
      // ==========================================
      if (interaction.commandName === 'status') {
        if (
          !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) &&
          !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
        ) {
          return interaction.reply({
            content: '❌ You must have "Manage Server" or Administrator permissions to use this command.',
            flags: MessageFlags.Ephemeral
          });
        }

        return interaction.reply(buildStatusControlPanel(interaction.client));
      }

      return;
    }

    // ==========================================
    // Handle Dropdown Select Menus for Bot Status
    // ==========================================
    if (interaction.isStringSelectMenu()) {
      const { customId, values, client } = interaction;

      if (customId === 'ticket_select_category') {
        return handleTicketCreate(interaction);
      }

      if (customId === 'select_bot_status_presence') {
        currentPresenceState.status = values[0];
        applyBotPresence(client);
        return interaction.update(buildStatusControlPanel(client));
      }

      if (customId === 'select_bot_status_activity_type') {
        currentPresenceState.activityType = Number(values[0]);
        applyBotPresence(client);
        return interaction.update(buildStatusControlPanel(client));
      }

      if (customId === 'select_bot_status_preset_text') {
        currentPresenceState.activityName = values[0] === 'preset_clear' ? '' : values[0];
        applyBotPresence(client);
        return interaction.update(buildStatusControlPanel(client));
      }
    }

    if (!interaction.isButton()) return;

    const { customId, guild, member, user } = interaction;

    // ==========================================
    // Handle Ticket System V2 Action Buttons
    // ==========================================
    if (customId.startsWith('ticket_btn_')) {
      if (customId === 'ticket_btn_claim') return handleTicketClaim(interaction);
      if (customId === 'ticket_btn_close') return handleTicketClose(interaction);
      if (customId === 'ticket_btn_transcript') return handleTicketTranscript(interaction);
      if (customId === 'ticket_btn_delete') return handleTicketDelete(interaction);
    }

    // ==========================================
    // Handle Interactive Music Control Buttons
    // ==========================================
    if (customId.startsWith('btn_music_')) {
      const player = getMusicPlayer();
      if (!player) {
        return interaction.reply({
          content: '⚠️ Music player service is initializing. Please try again.',
          flags: MessageFlags.Ephemeral
        });
      }

      const queue = player.nodes.get(guild.id);
      if (!queue) {
        return interaction.reply({
          content: '⚠️ No active music queue found in this server.',
          flags: MessageFlags.Ephemeral
        });
      }

      const voiceChannel = member?.voice?.channel;
      if (!voiceChannel || voiceChannel.id !== queue.channel?.id) {
        return interaction.reply({
          content: '❌ You must be in the same voice channel as the bot to control music!',
          flags: MessageFlags.Ephemeral
        });
      }

      // 1. Pause / Resume Toggle
      if (customId === 'btn_music_pause_resume') {
        const isPaused = queue.node.isPaused();
        if (isPaused) {
          queue.node.resume();
          await interaction.reply({ content: '▶️ Resumed music playback!', flags: MessageFlags.Ephemeral });
        } else {
          queue.node.pause();
          await interaction.reply({ content: '⏸️ Paused music playback!', flags: MessageFlags.Ephemeral });
        }
        try {
          await interaction.message.edit({
            components: buildMusicControlRows(!isPaused)
          });
        } catch (_) {}
        return;
      }

      // 2. Next / Skip
      if (customId === 'btn_music_skip') {
        if (!queue.isPlaying()) {
          return interaction.reply({ content: '⚠️ No song is currently playing to skip.', flags: MessageFlags.Ephemeral });
        }
        const skippedTrack = queue.currentTrack;
        queue.node.skip();
        return interaction.reply({
          content: `⏭️ Skipped **${skippedTrack?.title || 'current song'}**!`
        });
      }

      // 3. Stop & Disconnect
      if (customId === 'btn_music_stop') {
        queue.delete();
        return interaction.reply({
          content: `⏹️ Stopped music playback and left the voice channel.`
        });
      }

      // 4. Volume Down (-10%)
      if (customId === 'btn_music_voldown') {
        let currentVol = queue.node.volume;
        let newVol = Math.max(10, currentVol - 10);
        queue.node.setVolume(newVol);
        return interaction.reply({
          content: `🔉 Volume set to **${newVol}%**!`,
          flags: MessageFlags.Ephemeral
        });
      }

      // 5. Volume Up (+10%)
      if (customId === 'btn_music_volup') {
        let currentVol = queue.node.volume;
        let newVol = Math.min(100, currentVol + 10);
        queue.node.setVolume(newVol);
        return interaction.reply({
          content: `🔊 Volume set to **${newVol}%**!`,
          flags: MessageFlags.Ephemeral
        });
      }

      // 6. View Full Queue List
      if (customId === 'btn_music_queue') {
        const currentTrack = queue.currentTrack;
        if (!currentTrack) {
          return interaction.reply({ content: '⚠️ Music queue is empty.', flags: MessageFlags.Ephemeral });
        }

        const tracks = queue.tracks.data.slice(0, 15);
        let queueList = tracks.map((t, idx) => `**${idx + 1}.** [${t.title}](${t.url}) - \`${t.duration}\``).join('\n');
        if (queue.tracks.data.length > 15) {
          queueList += `\n*...and ${queue.tracks.data.length - 15} more track(s)*`;
        }

        const embed = new EmbedBuilder()
          .setColor('#1e90ff')
          .setTitle(`🎶 Full Music Queue - ${guild.name}`)
          .setDescription(`**Now Playing:**\n[**${currentTrack.title}**](${currentTrack.url}) - \`${currentTrack.duration}\`\n\n**Up Next:**\n${queueList || '*(No upcoming songs in queue)*'}`)
          .setFooter({ text: `Total songs in queue: ${queue.tracks.data.length + 1}` })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
    }

    // ==========================================
    // Handle "Reply to User" DM Button Click
    // ==========================================
    if (customId.startsWith('reply_dm_')) {
      const targetUserId = customId.replace('reply_dm_', '');
      const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);

      const modal = new ModalBuilder()
        .setCustomId(`modal_reply_dm_${targetUserId}`)
        .setTitle(`Reply to ${targetUser ? targetUser.username : 'User'}`);

      const replyInput = new TextInputBuilder()
        .setCustomId('reply_text_input')
        .setLabel(`Message to send to ${targetUser ? targetUser.username : 'User'}`)
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Type your reply here...')
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(replyInput);
      modal.addComponents(row);

      return interaction.showModal(modal);
    }

    if (!guild) return;

    // ==========================================
    // 1. User Clicks "Visitor"
    // ==========================================
    if (customId === 'select_role_visitor') {
      const visitorRole = resolveRole(guild, config.roles.visitor);
      if (!visitorRole) {
        return interaction.reply({
          content: `⚠️ The **${config.roles.visitor.name}** role could not be found. Please notify an administrator.`,
          flags: MessageFlags.Ephemeral
        });
      }

      if (member.roles.cache.has(visitorRole.id)) {
        return interaction.reply({
          content: `✅ You already have the **${visitorRole.name}** role!`,
          flags: MessageFlags.Ephemeral
        });
      }

      const added = await safelyAddRole(member, visitorRole);
      if (added) {
        return interaction.reply({
          content: `✅ You have been granted the **${visitorRole.name}** role!`,
          flags: MessageFlags.Ephemeral
        });
      } else {
        return interaction.reply({
          content: `⚠️ Could not assign the role. Ensure the bot has "Manage Roles" permission and its role is positioned above **${visitorRole.name}**.`,
          flags: MessageFlags.Ephemeral
        });
      }
    }

    // ==========================================
    // 2. User Clicks "Apply for Crew"
    // ==========================================
    if (customId === 'apply_role_crew') {
      const crewRole = resolveRole(guild, config.roles.crew);
      if (!crewRole) {
        return interaction.reply({
          content: `⚠️ The **${config.roles.crew.name}** role could not be found on this server. Please notify an administrator.`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Check if user already has Crew
      if (member.roles.cache.has(crewRole.id)) {
        return interaction.reply({
          content: `🚀 You are already an official member of the **${crewRole.name}**!`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Check for pending request
      if (pendingCrewRequests.has(user.id)) {
        return interaction.reply({
          content: `⏳ You already have a pending application for **${crewRole.name}**. Please wait for an administrator to review it!`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Resolve admin approval channel
      const approvalChannel = resolveChannel(guild, config.channels.crewRequests, 'Crew Requests');
      if (!approvalChannel) {
        return interaction.reply({
          content: `⚠️ The admin approval channel could not be found. Please notify a server administrator to set up the \`#crew-requests\` channel.`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Build Approval Embed for Admins
      const userAvatar = user.displayAvatarURL({ dynamic: true, size: 256 });
      const createdTimestamp = Math.floor(user.createdTimestamp / 1000);
      const joinedTimestamp = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;

      const approvalEmbed = new EmbedBuilder()
        .setColor(config.colors.warning)
        .setAuthor({
          name: `${formatUserTag(user)} applied for ${crewRole.name}`,
          iconURL: userAvatar
        })
        .setTitle(`📋 New Crew Role Application`)
        .setDescription(`Member ${member} has requested to join the **${config.serverName} ${crewRole.name}**.`)
        .addFields(
          {
            name: '👤 Applicant',
            value: `${member} (\`${formatUserTag(user)}\`)`,
            inline: true
          },
          {
            name: '🆔 User ID',
            value: `\`${user.id}\``,
            inline: true
          },
          {
            name: '📅 Account Age',
            value: `<t:${createdTimestamp}:F>\n(<t:${createdTimestamp}:R>)`,
            inline: false
          },
          {
            name: '📥 Joined Server',
            value: joinedTimestamp ? `<t:${joinedTimestamp}:F> (<t:${joinedTimestamp}:R>)` : 'Unknown',
            inline: false
          },
          {
            name: '📌 Current Status',
            value: `⏳ **Pending Administrator Review**`,
            inline: false
          }
        )
        .setThumbnail(userAvatar)
        .setFooter({ text: `Applicant ID: ${user.id}` })
        .setTimestamp();

      const approvalRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`approve_crew_${user.id}`)
          .setLabel(`Approve ${crewRole.name}`)
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`reject_crew_${user.id}`)
          .setLabel('Reject')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌')
      );

      // Ping role "core" if found
      const coreRole = resolveRole(guild, config.roles.core);
      const coreMention = coreRole ? `${coreRole}` : `\`@${config.roles.core.name}\``;

      await approvalChannel.send({
        content: `${coreMention} 🔔 **New Crew Application** from ${member}:`,
        embeds: [approvalEmbed],
        components: [approvalRow]
      });

      pendingCrewRequests.add(user.id);

      return interaction.reply({
        content: `📬 Your request to join the **${crewRole.name}** has been submitted! Our admins will review your application shortly.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // ==========================================
    // 3. Admin Clicks "Approve Crew"
    // ==========================================
    if (customId.startsWith('approve_crew_')) {
      const targetUserId = customId.replace('approve_crew_', '');

      // Check admin / reviewer permissions
      if (
        !member.permissions.has(PermissionFlagsBits.ManageRoles) &&
        !member.permissions.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({
          content: '❌ You must have "Manage Roles" or Administrator permissions to review applications.',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferUpdate();

      const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
      const crewRole = resolveRole(guild, config.roles.crew);
      const visitorRole = resolveRole(guild, config.roles.visitor);

      if (!crewRole) {
        return interaction.followUp({
          content: `⚠️ Role **${config.roles.crew.name}** not found on this server.`,
          flags: MessageFlags.Ephemeral
        });
      }

      let roleAssigned = false;
      if (targetMember) {
        roleAssigned = await safelyAddRole(targetMember, crewRole);
        if (visitorRole) {
          await safelyRemoveRole(targetMember, visitorRole);
        }

        // Send DM notification to user
        try {
          await targetMember.send({
            content: `🎉 Congratulations! Your application for the **${crewRole.name}** role in **${config.serverName}** has been **APPROVED** by ${interaction.user.tag}!`
          });
        } catch {
          logger.debug(`Could not DM user ${targetMember.user.tag} about approval (DMs closed).`);
        }
      }

      pendingCrewRequests.delete(targetUserId);

      // Disable buttons and update embed
      const currentEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
      currentEmbed
        .setColor(config.colors.joinLog)
        .spliceFields(4, 1, {
          name: '📌 Decision',
          value: `✅ **APPROVED** by ${interaction.user} (<t:${Math.floor(Date.now() / 1000)}:R>)\n${
            roleAssigned ? `Role \`@${crewRole.name}\` assigned.` : '⚠️ Target user could not be given the role (check hierarchy).'
          }`,
          inline: false
        });

      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('approved_disabled')
          .setLabel(`Approved by ${interaction.user.username}`)
          .setStyle(ButtonStyle.Success)
          .setDisabled(true)
          .setEmoji('✅')
      );

      await interaction.editReply({
        embeds: [currentEmbed],
        components: [disabledRow]
      });

      logger.success(`[${guild.name}] Admin ${interaction.user.tag} approved Crew role for user ID: ${targetUserId}`);
      return;
    }

    // ==========================================
    // 4. Admin Clicks "Reject"
    // ==========================================
    if (customId.startsWith('reject_crew_')) {
      const targetUserId = customId.replace('reject_crew_', '');

      // Check admin permissions
      if (
        !member.permissions.has(PermissionFlagsBits.ManageRoles) &&
        !member.permissions.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({
          content: '❌ You must have "Manage Roles" or Administrator permissions to review applications.',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferUpdate();

      const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
      const crewRoleName = config.roles.crew.name;

      if (targetMember) {
        try {
          await targetMember.send({
            content: `Hello, your application for the **${crewRoleName}** role in **${config.serverName}** was **not approved** at this time.`
          });
        } catch {
          logger.debug(`Could not DM user ${targetMember.user.tag} about rejection (DMs closed).`);
        }
      }

      pendingCrewRequests.delete(targetUserId);

      // Disable buttons and update embed
      const currentEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
      currentEmbed
        .setColor(config.colors.exitLog)
        .spliceFields(4, 1, {
          name: '📌 Decision',
          value: `❌ **REJECTED** by ${interaction.user} (<t:${Math.floor(Date.now() / 1000)}:R>)`,
          inline: false
        });

      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('rejected_disabled')
          .setLabel(`Rejected by ${interaction.user.username}`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
          .setEmoji('❌')
      );

      await interaction.editReply({
        embeds: [currentEmbed],
        components: [disabledRow]
      });

      logger.info(`[${guild.name}] Admin ${interaction.user.tag} rejected Crew role for user ID: ${targetUserId}`);
    }

    // ==========================================
    // 5. User Clicks "Apply for Team Magnera"
    // ==========================================
    if (customId === 'apply_role_magnera') {
      const magneraRole = resolveRole(guild, config.roles.magnera);
      if (!magneraRole) {
        return interaction.reply({
          content: `⚠️ The **${config.roles.magnera.name}** role could not be found on this server. Please notify an administrator.`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Check if user already has Team Magnera role
      if (member.roles.cache.has(magneraRole.id)) {
        return interaction.reply({
          content: `✨ You are already an official member of **${magneraRole.name}**!`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Check for pending request
      if (pendingMagneraRequests.has(user.id)) {
        return interaction.reply({
          content: `⏳ You already have a pending application for **${magneraRole.name}**. Please wait for an administrator to review it!`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Resolve admin approval channel
      const approvalChannel = resolveChannel(guild, config.channels.crewRequests, 'Crew Requests');
      if (!approvalChannel) {
        return interaction.reply({
          content: `⚠️ The admin approval channel could not be found. Please notify a server administrator to set up the \`#crew-requests\` channel.`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Build Approval Embed for Admins
      const userAvatar = user.displayAvatarURL({ dynamic: true, size: 256 });
      const createdTimestamp = Math.floor(user.createdTimestamp / 1000);
      const joinedTimestamp = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;

      const approvalEmbed = new EmbedBuilder()
        .setColor(config.colors.warning)
        .setAuthor({
          name: `${formatUserTag(user)} applied for ${magneraRole.name}`,
          iconURL: userAvatar
        })
        .setTitle(`📋 New Team Magnera Role Application`)
        .setDescription(`Member ${member} has requested to join **${config.serverName} ${magneraRole.name}**.`)
        .addFields(
          {
            name: '👤 Applicant',
            value: `${member} (\`${formatUserTag(user)}\`)`,
            inline: true
          },
          {
            name: '🆔 User ID',
            value: `\`${user.id}\``,
            inline: true
          },
          {
            name: '📅 Account Age',
            value: `<t:${createdTimestamp}:F>\n(<t:${createdTimestamp}:R>)`,
            inline: false
          },
          {
            name: '📥 Joined Server',
            value: joinedTimestamp ? `<t:${joinedTimestamp}:F> (<t:${joinedTimestamp}:R>)` : 'Unknown',
            inline: false
          },
          {
            name: '📌 Current Status',
            value: `⏳ **Pending Administrator Review**`,
            inline: false
          }
        )
        .setThumbnail(userAvatar)
        .setFooter({ text: `Applicant ID: ${user.id}` })
        .setTimestamp();

      const approvalRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`approve_magnera_${user.id}`)
          .setLabel(`Approve ${magneraRole.name}`)
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`reject_magnera_${user.id}`)
          .setLabel('Reject')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌')
      );

      // Ping role "core" if found
      const coreRole = resolveRole(guild, config.roles.core);
      const coreMention = coreRole ? `${coreRole}` : `\`@${config.roles.core.name}\``;

      await approvalChannel.send({
        content: `${coreMention} 🔔 **New Team Magnera Application** from ${member}:`,
        embeds: [approvalEmbed],
        components: [approvalRow]
      });

      pendingMagneraRequests.add(user.id);

      return interaction.reply({
        content: `📬 Your request to join **${magneraRole.name}** has been submitted! Our admins will review your application shortly.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // ==========================================
    // 6. Admin Clicks "Approve Team Magnera"
    // ==========================================
    if (customId.startsWith('approve_magnera_')) {
      const targetUserId = customId.replace('approve_magnera_', '');

      // Check admin / reviewer permissions
      if (
        !member.permissions.has(PermissionFlagsBits.ManageRoles) &&
        !member.permissions.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({
          content: '❌ You must have "Manage Roles" or Administrator permissions to review applications.',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferUpdate();

      const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
      const magneraRole = resolveRole(guild, config.roles.magnera);
      const visitorRole = resolveRole(guild, config.roles.visitor);

      if (!magneraRole) {
        return interaction.followUp({
          content: `⚠️ Role **${config.roles.magnera.name}** not found on this server.`,
          flags: MessageFlags.Ephemeral
        });
      }

      let roleAssigned = false;
      if (targetMember) {
        roleAssigned = await safelyAddRole(targetMember, magneraRole);
        if (visitorRole) {
          await safelyRemoveRole(targetMember, visitorRole);
        }

        // Send DM notification to user
        try {
          await targetMember.send({
            content: `🎉 Congratulations! Your application for the **${magneraRole.name}** role in **${config.serverName}** has been **APPROVED** by ${interaction.user.tag}!`
          });
        } catch {
          logger.debug(`Could not DM user ${targetMember.user.tag} about approval (DMs closed).`);
        }
      }

      pendingMagneraRequests.delete(targetUserId);

      // Disable buttons and update embed
      const currentEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
      currentEmbed
        .setColor(config.colors.joinLog)
        .spliceFields(4, 1, {
          name: '📌 Decision',
          value: `✅ **APPROVED** by ${interaction.user} (<t:${Math.floor(Date.now() / 1000)}:R>)\n${
            roleAssigned ? `Role \`@${magneraRole.name}\` assigned.` : '⚠️ Target user could not be given the role (check hierarchy).'
          }`,
          inline: false
        });

      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('approved_disabled')
          .setLabel(`Approved by ${interaction.user.username}`)
          .setStyle(ButtonStyle.Success)
          .setDisabled(true)
          .setEmoji('✅')
      );

      await interaction.editReply({
        embeds: [currentEmbed],
        components: [disabledRow]
      });

      logger.success(`[${guild.name}] Admin ${interaction.user.tag} approved Team Magnera role for user ID: ${targetUserId}`);
      return;
    }

    // ==========================================
    // 7. Admin Clicks "Reject Team Magnera"
    // ==========================================
    if (customId.startsWith('reject_magnera_')) {
      const targetUserId = customId.replace('reject_magnera_', '');

      // Check admin permissions
      if (
        !member.permissions.has(PermissionFlagsBits.ManageRoles) &&
        !member.permissions.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({
          content: '❌ You must have "Manage Roles" or Administrator permissions to review applications.',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferUpdate();

      const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
      const magneraRoleName = config.roles.magnera.name;

      if (targetMember) {
        try {
          await targetMember.send({
            content: `Hello, your application for the **${magneraRoleName}** role in **${config.serverName}** was **not approved** at this time.`
          });
        } catch {
          logger.debug(`Could not DM user ${targetMember.user.tag} about rejection (DMs closed).`);
        }
      }

      pendingMagneraRequests.delete(targetUserId);

      // Disable buttons and update embed
      const currentEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
      currentEmbed
        .setColor(config.colors.exitLog)
        .spliceFields(4, 1, {
          name: '📌 Decision',
          value: `❌ **REJECTED** by ${interaction.user} (<t:${Math.floor(Date.now() / 1000)}:R>)`,
          inline: false
        });

      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('rejected_disabled')
          .setLabel(`Rejected by ${interaction.user.username}`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
          .setEmoji('❌')
      );

      await interaction.editReply({
        embeds: [currentEmbed],
        components: [disabledRow]
      });

      logger.info(`[${guild.name}] Admin ${interaction.user.tag} rejected Team Magnera role for user ID: ${targetUserId}`);
    }
  }
};
