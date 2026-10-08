const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');
const logger = require('../utils/logger');
const config = require('../config');
const { resolveChannel } = require('../utils/channelHelper');
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

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;

    // ==========================================
    // 1. Handle Direct Messages (DMs sent to Bot)
    // ==========================================
    if (!message.guild) {
      const user = message.author;
      const userAvatar = user.displayAvatarURL({ dynamic: true, size: 256 });
      logger.info(`[DM Received] From ${formatUserTag(user)} (ID: ${user.id}): "${message.content}"`);

      // Find #dms channel in any guild the bot is in
      let dmsChannel = null;
      for (const guild of message.client.guilds.cache.values()) {
        const found = resolveChannel(guild, config.channels.dms, 'DMs Channel');
        if (found) {
          dmsChannel = found;
          break;
        }
      }

      if (!dmsChannel) {
        logger.warn(`Received DM from ${user.tag}, but could not find a "#dms" channel on any server.`);
        return;
      }

      // Build DM Log Embed
      const dmEmbed = new EmbedBuilder()
        .setColor(config.colors.dms)
        .setAuthor({
          name: `${toSmallCaps('Direct Message from')} ${formatUserTag(user)}`,
          iconURL: userAvatar
        })
        .setTitle(`💬 ${toSmallCaps('New Private Message Received')}`)
        .setDescription(message.content || '*(No text content)*')
        .addFields(
          {
            name: `👤 ${toSmallCaps('User')}`,
            value: `${user} (\`${formatUserTag(user)}\`)`,
            inline: true
          },
          {
            name: `🆔 ${toSmallCaps('User ID')}`,
            value: `\`${user.id}\``,
            inline: true
          }
        )
        .setThumbnail(userAvatar)
        .setFooter({ text: `User ID: ${user.id}` })
        .setTimestamp();

      // Handle attachments if user sent images or files
      if (message.attachments.size > 0) {
        const attachmentUrls = message.attachments.map((a) => a.url).join('\n');
        dmEmbed.addFields({
          name: `📎 ${toSmallCaps('Attachments')}`,
          value: attachmentUrls.slice(0, 1024)
        });
        const firstImage = message.attachments.find((a) => a.contentType?.startsWith('image/'));
        if (firstImage) {
          dmEmbed.setImage(firstImage.url);
        }
      }

      // Interactive Reply Button
      const replyRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`reply_dm_${user.id}`)
          .setLabel(toSmallCaps(`Reply to ${user.username}`))
          .setStyle(ButtonStyle.Primary)
          .setEmoji('💬')
      );

      try {
        await dmsChannel.send({
          content: `📬 **New DM from ${user}:**`,
          embeds: [dmEmbed],
          components: [replyRow]
        });
        logger.success(`Forwarded DM from ${user.tag} to #${dmsChannel.name}`);

        // React to user DM with checkmark as receipt
        await message.react('✅').catch(() => {});
      } catch (err) {
        logger.error(`Failed to forward DM to #${dmsChannel.name}: ${err.message}`);
      }
      return;
    }

    // ==========================================
    // 2. Handle Server Commands (!setup-roles)
    // ==========================================
    if (message.content.toLowerCase().trim() === '!setup-roles') {
      if (
        !message.member.permissions.has(PermissionFlagsBits.Administrator) &&
        !message.member.permissions.has(PermissionFlagsBits.ManageRoles)
      ) {
        return message.reply('❌ You must have "Administrator" or "Manage Roles" permissions to use this command.');
      }

      let targetChannel = null;
      if (
        config.channels.roles.names.some(
          (name) => name.toLowerCase() === message.channel.name.toLowerCase()
        )
      ) {
        targetChannel = message.channel;
      } else {
        targetChannel = resolveChannel(message.guild, config.channels.roles, 'Roles Channel');
      }

      if (!targetChannel) {
        return message.reply(
          `⚠️ Could not find the roles channel (looked for \`#${config.channels.roles.names[0]}\`). Please create a channel named \`#roles\` first or run this command directly inside it!`
        );
      }

      const deployed = await deployRolesPanel(targetChannel);
      if (deployed) {
        return message.reply(`✅ Roles selection panel successfully deployed to ${targetChannel}!`);
      } else {
        return message.reply(`⚠️ Failed to deploy role panel. Check bot permissions in ${targetChannel}.`);
      }
    }

    // ==========================================
    // 3. Handle Private Voice Commands (!vc / !w)
    // ==========================================
    const content = message.content.trim();
    if (content.startsWith('!vc') || content.startsWith('!w')) {
      const args = content.split(/\s+/).slice(1);
      const sub = (args[0] || '').toLowerCase();
      const guild = message.guild;
      const voiceChannel = resolveVoiceChannelW(guild);

      if (!voiceChannel) {
        return message.reply('⚠️ Private voice channel **"w"** was not found on this server. Please create a voice channel named `w` first!');
      }

      if (sub === 'claim') {
        setOwner(guild.id, message.author.id);
        await syncChannelPermissions(guild);
        return message.reply(`👑 You have successfully claimed ownership of private voice channel **#${voiceChannel.name}**! Only you and people you allow can join.`);
      }

      const isCallerOwner = isAllowed(guild, message.author.id);
      const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);

      if (!isCallerOwner && !isAdmin && sub !== 'list') {
        return message.reply(`❌ Only the designated owner or an authorized member of private voice channel **#${voiceChannel.name}** can manage the access list!`);
      }

      if (sub === 'allow') {
        const targetUser = message.mentions.users.first();
        if (!targetUser) {
          return message.reply('⚠️ Please mention a valid user to grant access to (e.g. `!vc allow @User`).');
        }

        const added = addAllowedUser(guild.id, targetUser.id);
        await syncChannelPermissions(guild);

        if (added) {
          return message.reply(`✅ Granted access to ${targetUser} (\`${formatUserTag(targetUser)}\`) for private voice channel **#${voiceChannel.name}**!`);
        } else {
          return message.reply(`ℹ️ ${targetUser} already has access to private voice channel **#${voiceChannel.name}**.`);
        }
      }

      if (sub === 'deny') {
        const targetUser = message.mentions.users.first();
        if (!targetUser) {
          return message.reply('⚠️ Please mention a valid user to revoke access from (e.g. `!vc deny @User`).');
        }

        const removed = removeAllowedUser(guild.id, targetUser.id);
        await syncChannelPermissions(guild);

        // Eject if currently inside channel 'w'
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        if (targetMember && targetMember.voice.channelId === voiceChannel.id) {
          await targetMember.voice.setChannel(null).catch(() => {});
        }

        if (removed) {
          return message.reply(`🚫 Revoked access from ${targetUser} (\`${formatUserTag(targetUser)}\`) for private voice channel **#${voiceChannel.name}**!`);
        } else {
          return message.reply(`ℹ️ ${targetUser} does not currently have access to private voice channel **#${voiceChannel.name}**.`);
        }
      }

      if (sub === 'list' || sub === '') {
        const { ownerId, allowedUsers } = getAllowedUsers(guild.id);
        const ownerText = ownerId ? `<@${ownerId}>` : '*(Not set - use `!vc claim`)*';
        
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

        return message.reply({ embeds: [listEmbed] });
      }
    }
  }
};
