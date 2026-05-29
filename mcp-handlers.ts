import {
  Client,
  ChannelType,
  TextChannel,
  NewsChannel,
  VoiceChannel,
  CategoryChannel,
  ForumChannel,
  GuildBasedChannel,
  Collection,
  Role,
  GuildMember,
  PermissionsBitField,
  Guild,
  ThreadChannel,
} from 'discord.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ToolResult = {
  content: [{ type: 'text'; text: string }];
  isError?: boolean;
};

type Args = Record<string, unknown>;
type ToolHandler = (client: Client, args: Args) => Promise<ToolResult>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Require a string arg, throw a descriptive error if missing or wrong type. */
export function requireString(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing or invalid argument: "${key}" must be a non-empty string.`);
  }
  return value.trim();
}

/** Get an optional string arg. Returns undefined if missing. */
export function optionalString(args: Args, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`Argument "${key}" must be a string.`);
  return value.trim() || undefined;
}

/** Get an optional number arg. Returns undefined if missing. */
export function optionalNumber(args: Args, key: string): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number') throw new Error(`Argument "${key}" must be a number.`);
  return value;
}

/**
 * Assert a channel is a standard text or announcement channel (can send messages,
 * fetch history, hold webhooks, and start threads). Both TextChannel and NewsChannel
 * support every method used by the message/webhook/thread handlers.
 */
export function asTextChannel(channel: GuildBasedChannel | null): TextChannel | NewsChannel {
  if (!channel) throw new Error('Channel not found.');
  if (channel instanceof TextChannel || channel instanceof NewsChannel) return channel;
  throw new Error(`Channel "${channel.name}" is not a text or announcement channel.`);
}

/** Resolve a guild channel with type narrowing. */
export async function fetchGuildChannel(client: Client, channelId: string): Promise<GuildBasedChannel> {
  const channel = await client.channels.fetch(channelId);
  if (!channel) throw new Error(`Channel with ID "${channelId}" not found.`);
  if (!channel.isThread() && 'guild' in channel) return channel as GuildBasedChannel;
  throw new Error(`Channel "${channelId}" is not a guild channel.`);
}

/** Check if the bot has the required permissions in a guild. */
export function requireBotPermissions(guild: Guild, permissions: bigint[], actionDescription: string): void {
  const botMember = guild.members.me;
  if (!botMember) return;
  const missing = botMember.permissions.missing(permissions);
  if (missing.length > 0) {
    throw new Error(`Cannot ${actionDescription}. I don't have the required permissions in this server: ${missing.join(', ')}`);
  }
}

export function ok(text: string): ToolResult {
  return { content: [{ type: 'text' as const, text }] };
}

export function formatMembers(members: Collection<string, GuildMember>): object[] {
  return members.map((m) => ({
    id: m.id,
    username: m.user.username,
    displayName: m.displayName,
    roles: m.roles.cache
      .filter((r: Role) => r.name !== '@everyone')
      .map((r: Role) => ({ id: r.id, name: r.name })),
    joinedAt: m.joinedAt?.toISOString() ?? null,
    bot: m.user.bot,
  }));
}

// ─── Tool Handlers ───────────────────────────────────────────────────────────

// ── Server ───────────────────────────────────────────────────────────────────

const listGuilds: ToolHandler = async (client) => {
  const guilds = client.guilds.cache.map((g) => ({
    id: g.id,
    name: g.name,
    memberCount: g.memberCount,
  }));
  return ok(JSON.stringify(guilds, null, 2));
};

const listChannels: ToolHandler = async (client, args) => {
  const guildId = requireString(args, 'guild_id');
  const guild = await client.guilds.fetch(guildId);
  const channels = await guild.channels.fetch();
  const result = [...channels.values()]
    .filter((ch) => ch !== null)
    .map((ch) => {
      const c = ch as NonNullable<typeof ch>;
      return {
        id: c.id,
        name: c.name,
        type: ChannelType[c.type],
        parentId: 'parentId' in c ? (c as { parentId: string | null }).parentId : null,
        position: 'position' in c ? (c as { position: number }).position : null,
      };
    });
  return ok(JSON.stringify(result, null, 2));
};

// ── Channel management ───────────────────────────────────────────────────────

const createCategory: ToolHandler = async (client, args) => {
  const guildId = requireString(args, 'guild_id');
  const catName = requireString(args, 'name');
  const position = optionalNumber(args, 'position');
  const guild = await client.guilds.fetch(guildId);
  requireBotPermissions(guild, [PermissionsBitField.Flags.ManageChannels], 'create category');
  const cat = await guild.channels.create({
    name: catName,
    type: ChannelType.GuildCategory,
    ...(position !== undefined && { position }),
  });
  return ok(`Created category "${cat.name}" (ID: ${cat.id})`);
};

const createChannel: ToolHandler = async (client, args) => {
  const guildId = requireString(args, 'guild_id');
  const channelName = requireString(args, 'name');
  const isVoice = args['type'] === 'voice';
  const categoryId = optionalString(args, 'category_id');
  const topic = optionalString(args, 'topic');
  const guild = await client.guilds.fetch(guildId);
  requireBotPermissions(guild, [PermissionsBitField.Flags.ManageChannels], 'create channel');
  const ch = await guild.channels.create({
    name: channelName,
    type: isVoice ? ChannelType.GuildVoice : ChannelType.GuildText,
    ...(categoryId && { parent: categoryId }),
    ...(!isVoice && topic && { topic }),
  });
  return ok(`Created ${isVoice ? 'voice' : 'text'} channel "#${ch.name}" (ID: ${ch.id})`);
};

const deleteChannel: ToolHandler = async (client, args) => {
  const channelId = requireString(args, 'channel_id');
  const reason = optionalString(args, 'reason');
  const ch = await fetchGuildChannel(client, channelId);
  requireBotPermissions(ch.guild, [PermissionsBitField.Flags.ManageChannels], 'delete channel');
  if (
    ch instanceof TextChannel ||
    ch instanceof VoiceChannel ||
    ch instanceof CategoryChannel
  ) {
    await ch.delete(reason);
  } else {
    throw new Error(`Channel type "${ChannelType[ch.type]}" does not support deletion via this tool.`);
  }
  return ok(`Deleted channel/category (ID: ${channelId})`);
};

const moveChannel: ToolHandler = async (client, args) => {
  const channelId = requireString(args, 'channel_id');
  const categoryId = optionalString(args, 'category_id');
  const ch = await fetchGuildChannel(client, channelId);
  requireBotPermissions(ch.guild, [PermissionsBitField.Flags.ManageChannels], 'move channel');
  if (ch instanceof TextChannel || ch instanceof VoiceChannel) {
    await ch.setParent(categoryId ?? null);
  } else {
    throw new Error('Only text or voice channels can be moved into a category.');
  }
  return ok(`Moved channel to category ${categoryId ?? 'none'}`);
};

const renameChannel: ToolHandler = async (client, args) => {
  const channelId = requireString(args, 'channel_id');
  const newName = requireString(args, 'name');
  const reason = optionalString(args, 'reason');
  const ch = await fetchGuildChannel(client, channelId);
  requireBotPermissions(ch.guild, [PermissionsBitField.Flags.ManageChannels], 'rename channel');
  if (
    ch instanceof TextChannel ||
    ch instanceof VoiceChannel ||
    ch instanceof CategoryChannel
  ) {
    await ch.setName(newName, reason);
  } else {
    throw new Error(`Channel type "${ChannelType[ch.type]}" does not support renaming via this tool.`);
  }
  return ok(`Renamed channel to "${newName}"`);
};

// ── Messages ─────────────────────────────────────────────────────────────────

const getChannelMessages: ToolHandler = async (client, args) => {
  const channelId = requireString(args, 'channel_id');
  const rawLimit = optionalNumber(args, 'limit');
  const before = optionalString(args, 'before');
  const after = optionalString(args, 'after');
  const limit = Math.min(Math.max(rawLimit ?? 50, 1), 100);
  const ch = await fetchGuildChannel(client, channelId);
  const textCh = asTextChannel(ch);
  const fetchOptions: { limit: number; before?: string; after?: string } = { limit };
  if (before) fetchOptions.before = before;
  if (after) fetchOptions.after = after;
  const messages = await textCh.messages.fetch(fetchOptions);
  const result = [...messages.values()].reverse().map((m) => ({
    id: m.id,
    author: m.author.username,
    content: m.content,
    timestamp: m.createdAt.toISOString(),
    attachments: m.attachments.size,
  }));
  return ok(JSON.stringify(result, null, 2));
};

const sendMessage: ToolHandler = async (client, args) => {
  const channelId = requireString(args, 'channel_id');
  const content = requireString(args, 'content');
  if (content.length > 2000) {
    throw new Error('Message content exceeds Discord\'s 2000 character limit.');
  }
  const ch = await fetchGuildChannel(client, channelId);
  const textCh = asTextChannel(ch);
  const sent = await textCh.send(content);
  return ok(`Message sent (ID: ${sent.id}) to channel ${channelId}`);
};

// ── Members ──────────────────────────────────────────────────────────────────

const listMembers: ToolHandler = async (client, args) => {
  const guildId = requireString(args, 'guild_id');
  const rawLimit = optionalNumber(args, 'limit');
  const limit = Math.min(Math.max(rawLimit ?? 100, 1), 1000);
  const guild = await client.guilds.fetch(guildId);
  const members = await guild.members.fetch({ limit });
  return ok(JSON.stringify(formatMembers(members), null, 2));
};

const getMember: ToolHandler = async (client, args) => {
  const guildId = requireString(args, 'guild_id');
  const userId = requireString(args, 'user_id');
  const guild = await client.guilds.fetch(guildId);
  const member = await guild.members.fetch(userId);
  const data = {
    id: member.id,
    username: member.user.username,
    displayName: member.displayName,
    roles: member.roles.cache
      .filter((r: Role) => r.name !== '@everyone')
      .map((r: Role) => ({ id: r.id, name: r.name, color: r.hexColor })),
    joinedAt: member.joinedAt?.toISOString() ?? null,
    createdAt: member.user.createdAt.toISOString(),
    bot: member.user.bot,
    nickname: member.nickname,
  };
  return ok(JSON.stringify(data, null, 2));
};

// ── Roles ────────────────────────────────────────────────────────────────────

const listRoles: ToolHandler = async (client, args) => {
  const guildId = requireString(args, 'guild_id');
  const guild = await client.guilds.fetch(guildId);
  const roles = await guild.roles.fetch();
  const result = [...roles.values()]
    .sort((a, b) => b.position - a.position)
    .map((r: Role) => ({
      id: r.id,
      name: r.name,
      color: r.hexColor,
      position: r.position,
      memberCount: r.members.size,
      managed: r.managed,
      mentionable: r.mentionable,
    }));
  return ok(JSON.stringify(result, null, 2));
};

const assignRole: ToolHandler = async (client, args) => {
  const guildId = requireString(args, 'guild_id');
  const userId = requireString(args, 'user_id');
  const roleId = requireString(args, 'role_id');
  const reason = optionalString(args, 'reason');
  const guild = await client.guilds.fetch(guildId);
  requireBotPermissions(guild, [PermissionsBitField.Flags.ManageRoles], 'assign role');
  const member = await guild.members.fetch(userId);
  const role = await guild.roles.fetch(roleId);
  if (!role) throw new Error(`Role with ID "${roleId}" not found.`);
  await member.roles.add(role, reason);
  return ok(`Assigned role "${role.name}" to ${member.user.username}`);
};

const removeRole: ToolHandler = async (client, args) => {
  const guildId = requireString(args, 'guild_id');
  const userId = requireString(args, 'user_id');
  const roleId = requireString(args, 'role_id');
  const reason = optionalString(args, 'reason');
  const guild = await client.guilds.fetch(guildId);
  requireBotPermissions(guild, [PermissionsBitField.Flags.ManageRoles], 'remove role');
  const member = await guild.members.fetch(userId);
  const role = await guild.roles.fetch(roleId);
  if (!role) throw new Error(`Role with ID "${roleId}" not found.`);
  await member.roles.remove(role, reason);
  return ok(`Removed role "${role.name}" from ${member.user.username}`);
};

// ── Message enhancements ────────────────────────────────────────────────────

const deleteMessage: ToolHandler = async (client, args) => {
  const channelId = requireString(args, 'channel_id');
  const messageId = requireString(args, 'message_id');
  const ch = await fetchGuildChannel(client, channelId);
  const textCh = asTextChannel(ch);
  const message = await textCh.messages.fetch(messageId);
  await message.delete();
  return ok(`Deleted message (ID: ${messageId}) from channel ${channelId}`);
};

const editMessage: ToolHandler = async (client, args) => {
  const channelId = requireString(args, 'channel_id');
  const messageId = requireString(args, 'message_id');
  const content = requireString(args, 'content');
  if (content.length > 2000) {
    throw new Error('Message content exceeds Discord\'s 2000 character limit.');
  }
  const ch = await fetchGuildChannel(client, channelId);
  const textCh = asTextChannel(ch);
  const message = await textCh.messages.fetch(messageId);
  if (message.author.id !== client.user?.id) {
    throw new Error('Can only edit messages sent by the bot.');
  }
  await message.edit(content);
  return ok(`Edited message (ID: ${messageId})`);
};

const searchMessages: ToolHandler = async (client, args) => {
  const channelId = requireString(args, 'channel_id');
  const query = requireString(args, 'query').toLowerCase();
  const rawLimit = optionalNumber(args, 'limit');
  const limit = Math.min(Math.max(rawLimit ?? 50, 1), 100);
  const ch = await fetchGuildChannel(client, channelId);
  const textCh = asTextChannel(ch);
  const messages = await textCh.messages.fetch({ limit: 100 });
  const matches = [...messages.values()]
    .filter((m) => m.content.toLowerCase().includes(query))
    .slice(0, limit)
    .reverse()
    .map((m) => ({
      id: m.id,
      author: m.author.username,
      content: m.content,
      timestamp: m.createdAt.toISOString(),
    }));
  // Discord has no server-side text search API for bots, so this only scans the
  // most recent 100 messages. Surface that explicitly so empty results aren't
  // mistaken for "no such message ever existed".
  return ok(
    JSON.stringify(
      {
        note: 'Searched only the 100 most recent messages in this channel.',
        matchCount: matches.length,
        matches,
      },
      null,
      2,
    ),
  );
};

const sendDm: ToolHandler = async (client, args) => {
  const userId = requireString(args, 'user_id');
  const content = requireString(args, 'content');
  if (content.length > 2000) {
    throw new Error('Message content exceeds Discord\'s 2000 character limit.');
  }
  const user = await client.users.fetch(userId);
  const sent = await user.send(content);
  return ok(`DM sent (ID: ${sent.id}) to user ${user.username}`);
};

const addReaction: ToolHandler = async (client, args) => {
  const channelId = requireString(args, 'channel_id');
  const messageId = requireString(args, 'message_id');
  const emoji = requireString(args, 'emoji');
  const ch = await fetchGuildChannel(client, channelId);
  const textCh = asTextChannel(ch);
  const message = await textCh.messages.fetch(messageId);
  await message.react(emoji);
  return ok(`Added reaction ${emoji} to message ${messageId}`);
};

const removeReaction: ToolHandler = async (client, args) => {
  const channelId = requireString(args, 'channel_id');
  const messageId = requireString(args, 'message_id');
  const emoji = requireString(args, 'emoji');
  const ch = await fetchGuildChannel(client, channelId);
  const textCh = asTextChannel(ch);
  const message = await textCh.messages.fetch(messageId);
  const botUser = client.user;
  if (!botUser) throw new Error('Bot user not available.');
  await message.reactions.resolve(emoji)?.users.remove(botUser.id);
  return ok(`Removed reaction ${emoji} from message ${messageId}`);
};

const addMultipleReactions: ToolHandler = async (client, args) => {
  const channelId = requireString(args, 'channel_id');
  const messageId = requireString(args, 'message_id');
  const emojis = args['emojis'];
  if (!Array.isArray(emojis) || emojis.length === 0) {
    throw new Error('Argument "emojis" must be a non-empty array of strings.');
  }
  const ch = await fetchGuildChannel(client, channelId);
  const textCh = asTextChannel(ch);
  const message = await textCh.messages.fetch(messageId);
  for (const emoji of emojis) {
    if (typeof emoji !== 'string') throw new Error('Each emoji must be a string.');
    await message.react(emoji);
  }
  return ok(`Added ${emojis.length} reactions to message ${messageId}`);
};

// ── Forum channels ──────────────────────────────────────────────────────────

const listForumChannels: ToolHandler = async (client, args) => {
  const guildId = requireString(args, 'guild_id');
  const guild = await client.guilds.fetch(guildId);
  const channels = await guild.channels.fetch();
  const forums = [...channels.values()]
    .filter((ch): ch is ForumChannel => ch !== null && ch.type === ChannelType.GuildForum)
    .map((f) => ({
      id: f.id,
      name: f.name,
      topic: f.topic,
      parentId: f.parentId,
      threadCount: f.threads.cache.size,
    }));
  return ok(JSON.stringify(forums, null, 2));
};

const createForumPost: ToolHandler = async (client, args) => {
  const channelId = requireString(args, 'channel_id');
  const title = requireString(args, 'title');
  const content = requireString(args, 'content');
  const channel = await client.channels.fetch(channelId);
  if (!channel || channel.type !== ChannelType.GuildForum) {
    throw new Error(`Channel "${channelId}" is not a forum channel.`);
  }
  const forum = channel as ForumChannel;
  const thread = await forum.threads.create({
    name: title,
    message: { content },
  });
  return ok(`Created forum post "${thread.name}" (ID: ${thread.id})`);
};

const getForumPost: ToolHandler = async (client, args) => {
  const threadId = requireString(args, 'thread_id');
  const rawLimit = optionalNumber(args, 'limit');
  const limit = Math.min(Math.max(rawLimit ?? 50, 1), 100);
  const thread = await client.channels.fetch(threadId);
  if (!thread || !thread.isThread()) {
    throw new Error(`Channel "${threadId}" is not a thread/forum post.`);
  }
  const threadCh = thread as ThreadChannel;
  const messages = await threadCh.messages.fetch({ limit });
  const result = {
    id: threadCh.id,
    name: threadCh.name,
    archived: threadCh.archived,
    locked: threadCh.locked,
    messageCount: threadCh.messageCount,
    messages: [...messages.values()].reverse().map((m) => ({
      id: m.id,
      author: m.author.username,
      content: m.content,
      timestamp: m.createdAt.toISOString(),
    })),
  };
  return ok(JSON.stringify(result, null, 2));
};

const replyToForumPost: ToolHandler = async (client, args) => {
  const threadId = requireString(args, 'thread_id');
  const content = requireString(args, 'content');
  if (content.length > 2000) {
    throw new Error('Message content exceeds Discord\'s 2000 character limit.');
  }
  const thread = await client.channels.fetch(threadId);
  if (!thread || !thread.isThread()) {
    throw new Error(`Channel "${threadId}" is not a thread/forum post.`);
  }
  const threadCh = thread as ThreadChannel;
  const sent = await threadCh.send(content);
  return ok(`Replied to forum post "${threadCh.name}" (message ID: ${sent.id})`);
};

const deleteForumPost: ToolHandler = async (client, args) => {
  const threadId = requireString(args, 'thread_id');
  const thread = await client.channels.fetch(threadId);
  if (!thread || !thread.isThread()) {
    throw new Error(`Channel "${threadId}" is not a thread/forum post.`);
  }
  const threadCh = thread as ThreadChannel;
  const name = threadCh.name;
  await threadCh.delete();
  return ok(`Deleted forum post "${name}" (ID: ${threadId})`);
};

// ── Webhooks ────────────────────────────────────────────────────────────────

const createWebhook: ToolHandler = async (client, args) => {
  const channelId = requireString(args, 'channel_id');
  const name = requireString(args, 'name');
  const ch = await fetchGuildChannel(client, channelId);
  requireBotPermissions(ch.guild, [PermissionsBitField.Flags.ManageWebhooks], 'create webhook');
  const textCh = asTextChannel(ch);
  const webhook = await textCh.createWebhook({ name });
  return ok(JSON.stringify({
    id: webhook.id,
    name: webhook.name,
    url: webhook.url,
    channelId: webhook.channelId,
  }, null, 2));
};

const sendWebhookMessage: ToolHandler = async (client, args) => {
  const channelId = requireString(args, 'channel_id');
  const webhookId = requireString(args, 'webhook_id');
  const content = requireString(args, 'content');
  const username = optionalString(args, 'username');
  if (content.length > 2000) {
    throw new Error('Message content exceeds Discord\'s 2000 character limit.');
  }
  const ch = await fetchGuildChannel(client, channelId);
  const textCh = asTextChannel(ch);
  const webhooks = await textCh.fetchWebhooks();
  const webhook = webhooks.get(webhookId);
  if (!webhook) throw new Error(`Webhook "${webhookId}" not found in channel.`);
  await webhook.send({ content, ...(username && { username }) });
  return ok(`Sent webhook message to channel ${channelId}`);
};

const editWebhook: ToolHandler = async (client, args) => {
  const channelId = requireString(args, 'channel_id');
  const webhookId = requireString(args, 'webhook_id');
  const name = optionalString(args, 'name');
  const ch = await fetchGuildChannel(client, channelId);
  requireBotPermissions(ch.guild, [PermissionsBitField.Flags.ManageWebhooks], 'edit webhook');
  const textCh = asTextChannel(ch);
  const webhooks = await textCh.fetchWebhooks();
  const webhook = webhooks.get(webhookId);
  if (!webhook) throw new Error(`Webhook "${webhookId}" not found in channel.`);
  const updated = await webhook.edit({ ...(name && { name }) });
  return ok(`Updated webhook "${updated.name}" (ID: ${updated.id})`);
};

const deleteWebhook: ToolHandler = async (client, args) => {
  const channelId = requireString(args, 'channel_id');
  const webhookId = requireString(args, 'webhook_id');
  const ch = await fetchGuildChannel(client, channelId);
  requireBotPermissions(ch.guild, [PermissionsBitField.Flags.ManageWebhooks], 'delete webhook');
  const textCh = asTextChannel(ch);
  const webhooks = await textCh.fetchWebhooks();
  const webhook = webhooks.get(webhookId);
  if (!webhook) throw new Error(`Webhook "${webhookId}" not found in channel.`);
  await webhook.delete();
  return ok(`Deleted webhook "${webhook.name}" (ID: ${webhookId})`);
};

// ── Moderation ──────────────────────────────────────────────────────────────

const kickMember: ToolHandler = async (client, args) => {
  const guildId = requireString(args, 'guild_id');
  const userId = requireString(args, 'user_id');
  const reason = optionalString(args, 'reason');
  const guild = await client.guilds.fetch(guildId);
  requireBotPermissions(guild, [PermissionsBitField.Flags.KickMembers], 'kick member');
  const member = await guild.members.fetch(userId);
  await member.kick(reason);
  return ok(`Kicked ${member.user.username} from ${guild.name}`);
};

const banMember: ToolHandler = async (client, args) => {
  const guildId = requireString(args, 'guild_id');
  const userId = requireString(args, 'user_id');
  const reason = optionalString(args, 'reason');
  const rawDeleteDays = optionalNumber(args, 'delete_message_days');
  // Discord only accepts 0–7 days of message deletion; clamp instead of erroring.
  const deleteMessageDays =
    rawDeleteDays !== undefined ? Math.min(Math.max(rawDeleteDays, 0), 7) : undefined;
  const guild = await client.guilds.fetch(guildId);
  requireBotPermissions(guild, [PermissionsBitField.Flags.BanMembers], 'ban member');
  await guild.members.ban(userId, {
    reason,
    ...(deleteMessageDays !== undefined && { deleteMessageSeconds: deleteMessageDays * 86400 }),
  });
  return ok(`Banned user ${userId} from ${guild.name}`);
};

const unbanMember: ToolHandler = async (client, args) => {
  const guildId = requireString(args, 'guild_id');
  const userId = requireString(args, 'user_id');
  const reason = optionalString(args, 'reason');
  const guild = await client.guilds.fetch(guildId);
  requireBotPermissions(guild, [PermissionsBitField.Flags.BanMembers], 'unban member');
  await guild.members.unban(userId, reason);
  return ok(`Unbanned user ${userId} from ${guild.name}`);
};

const timeoutMember: ToolHandler = async (client, args) => {
  const guildId = requireString(args, 'guild_id');
  const userId = requireString(args, 'user_id');
  // Discord caps timeouts at 28 days (40320 minutes); clamp to a valid range.
  const rawMinutes = optionalNumber(args, 'duration_minutes') ?? 5;
  const durationMinutes = Math.min(Math.max(rawMinutes, 1), 40320);
  const reason = optionalString(args, 'reason');
  const guild = await client.guilds.fetch(guildId);
  requireBotPermissions(guild, [PermissionsBitField.Flags.ModerateMembers], 'timeout member');
  const member = await guild.members.fetch(userId);
  const ms = durationMinutes * 60 * 1000;
  await member.timeout(ms, reason);
  return ok(`Timed out ${member.user.username} for ${durationMinutes} minutes`);
};

const setNickname: ToolHandler = async (client, args) => {
  const guildId = requireString(args, 'guild_id');
  const userId = requireString(args, 'user_id');
  const nickname = args['nickname'] === null || args['nickname'] === '' ? null : optionalString(args, 'nickname') ?? null;
  const reason = optionalString(args, 'reason');
  const guild = await client.guilds.fetch(guildId);
  requireBotPermissions(guild, [PermissionsBitField.Flags.ManageNicknames], 'set nickname');
  const member = await guild.members.fetch(userId);
  await member.setNickname(nickname, reason);
  return ok(`Set nickname of ${member.user.username} to ${nickname ?? '(reset)'}`);
};

// ── Role CRUD ───────────────────────────────────────────────────────────────

const createRole: ToolHandler = async (client, args) => {
  const guildId = requireString(args, 'guild_id');
  const name = requireString(args, 'name');
  const color = optionalString(args, 'color');
  const mentionable = args['mentionable'] === true;
  const reason = optionalString(args, 'reason');
  const guild = await client.guilds.fetch(guildId);
  requireBotPermissions(guild, [PermissionsBitField.Flags.ManageRoles], 'create role');
  const role = await guild.roles.create({
    name,
    ...(color && { color: color as `#${string}` }),
    mentionable,
    reason,
  });
  return ok(`Created role "${role.name}" (ID: ${role.id}, color: ${role.hexColor})`);
};

const editRole: ToolHandler = async (client, args) => {
  const guildId = requireString(args, 'guild_id');
  const roleId = requireString(args, 'role_id');
  const name = optionalString(args, 'name');
  const color = optionalString(args, 'color');
  const reason = optionalString(args, 'reason');
  const guild = await client.guilds.fetch(guildId);
  requireBotPermissions(guild, [PermissionsBitField.Flags.ManageRoles], 'edit role');
  const role = await guild.roles.fetch(roleId);
  if (!role) throw new Error(`Role with ID "${roleId}" not found.`);
  await role.edit({
    ...(name && { name }),
    ...(color && { color: color as `#${string}` }),
    reason,
  });
  return ok(`Updated role "${role.name}" (ID: ${role.id})`);
};

const deleteRole: ToolHandler = async (client, args) => {
  const guildId = requireString(args, 'guild_id');
  const roleId = requireString(args, 'role_id');
  const reason = optionalString(args, 'reason');
  const guild = await client.guilds.fetch(guildId);
  requireBotPermissions(guild, [PermissionsBitField.Flags.ManageRoles], 'delete role');
  const role = await guild.roles.fetch(roleId);
  if (!role) throw new Error(`Role with ID "${roleId}" not found.`);
  const roleName = role.name;
  await role.delete(reason);
  return ok(`Deleted role "${roleName}" (ID: ${roleId})`);
};

// ── Thread management ───────────────────────────────────────────────────────

const createThread: ToolHandler = async (client, args) => {
  const channelId = requireString(args, 'channel_id');
  const name = requireString(args, 'name');
  const messageId = optionalString(args, 'message_id');
  const ch = await fetchGuildChannel(client, channelId);
  const textCh = asTextChannel(ch);
  const thread = messageId
    ? await textCh.threads.create({ name, startMessage: messageId })
    : await textCh.threads.create({ name });
  return ok(`Created thread "${thread.name}" (ID: ${thread.id})`);
};

const listThreads: ToolHandler = async (client, args) => {
  const channelId = requireString(args, 'channel_id');
  const ch = await fetchGuildChannel(client, channelId);
  const textCh = asTextChannel(ch);
  const active = await textCh.threads.fetchActive();
  const archived = await textCh.threads.fetchArchived();
  const allThreads = [
    ...[...active.threads.values()].map((t) => ({
      id: t.id, name: t.name, archived: false, locked: t.locked, messageCount: t.messageCount,
    })),
    ...[...archived.threads.values()].map((t) => ({
      id: t.id, name: t.name, archived: true, locked: t.locked, messageCount: t.messageCount,
    })),
  ];
  return ok(JSON.stringify(allThreads, null, 2));
};

const archiveThread: ToolHandler = async (client, args) => {
  const threadId = requireString(args, 'thread_id');
  const locked = args['locked'] === true;
  const thread = await client.channels.fetch(threadId);
  if (!thread || !thread.isThread()) {
    throw new Error(`Channel "${threadId}" is not a thread.`);
  }
  const threadCh = thread as ThreadChannel;
  await threadCh.setArchived(true);
  if (locked) await threadCh.setLocked(true);
  return ok(`Archived thread "${threadCh.name}"${locked ? ' (locked)' : ''}`);
};

const unarchiveThread: ToolHandler = async (client, args) => {
  const threadId = requireString(args, 'thread_id');
  const thread = await client.channels.fetch(threadId);
  if (!thread || !thread.isThread()) {
    throw new Error(`Channel "${threadId}" is not a thread.`);
  }
  const threadCh = thread as ThreadChannel;
  await threadCh.setArchived(false);
  return ok(`Unarchived thread "${threadCh.name}"`);
};

const joinThread: ToolHandler = async (client, args) => {
  const threadId = requireString(args, 'thread_id');
  const thread = await client.channels.fetch(threadId);
  if (!thread || !thread.isThread()) {
    throw new Error(`Channel "${threadId}" is not a thread.`);
  }
  const threadCh = thread as ThreadChannel;
  await threadCh.join();
  return ok(`Joined thread "${threadCh.name}"`);
};

const deleteThread: ToolHandler = async (client, args) => {
  const threadId = requireString(args, 'thread_id');
  const thread = await client.channels.fetch(threadId);
  if (!thread || !thread.isThread()) {
    throw new Error(`Channel "${threadId}" is not a thread.`);
  }
  const threadCh = thread as ThreadChannel;
  const name = threadCh.name;
  await threadCh.delete();
  return ok(`Deleted thread "${name}" (ID: ${threadId})`);
};

// ─── Tool Registry ───────────────────────────────────────────────────────────

const toolRegistry = new Map<string, ToolHandler>([
  // Server
  ['list_guilds', listGuilds],
  ['list_channels', listChannels],
  // Channel management
  ['create_category', createCategory],
  ['create_channel', createChannel],
  ['delete_channel', deleteChannel],
  ['move_channel', moveChannel],
  ['rename_channel', renameChannel],
  // Messages
  ['get_channel_messages', getChannelMessages],
  ['send_message', sendMessage],
  ['delete_message', deleteMessage],
  ['edit_message', editMessage],
  ['search_messages', searchMessages],
  ['send_dm', sendDm],
  ['add_reaction', addReaction],
  ['remove_reaction', removeReaction],
  ['add_multiple_reactions', addMultipleReactions],
  // Forum channels
  ['list_forum_channels', listForumChannels],
  ['create_forum_post', createForumPost],
  ['get_forum_post', getForumPost],
  ['reply_to_forum_post', replyToForumPost],
  ['delete_forum_post', deleteForumPost],
  // Webhooks
  ['create_webhook', createWebhook],
  ['send_webhook_message', sendWebhookMessage],
  ['edit_webhook', editWebhook],
  ['delete_webhook', deleteWebhook],
  // Members
  ['list_members', listMembers],
  ['get_member', getMember],
  // Roles
  ['list_roles', listRoles],
  ['assign_role', assignRole],
  ['remove_role', removeRole],
  // Moderation
  ['kick_member', kickMember],
  ['ban_member', banMember],
  ['unban_member', unbanMember],
  ['timeout_member', timeoutMember],
  ['set_nickname', setNickname],
  // Role CRUD
  ['create_role', createRole],
  ['edit_role', editRole],
  ['delete_role', deleteRole],
  // Thread management
  ['create_thread', createThread],
  ['list_threads', listThreads],
  ['archive_thread', archiveThread],
  ['unarchive_thread', unarchiveThread],
  ['join_thread', joinThread],
  ['delete_thread', deleteThread],
]);

// ─── Tool Classification ─────────────────────────────────────────────────────

/** Tools that only read state — safe to expose in read-only deployments. */
export const READ_ONLY_TOOLS = new Set<string>([
  'list_guilds',
  'list_channels',
  'get_channel_messages',
  'search_messages',
  'list_forum_channels',
  'get_forum_post',
  'list_members',
  'get_member',
  'list_roles',
  'list_threads',
]);

/** Tools that perform irreversible destructive updates (for destructiveHint). */
export const DESTRUCTIVE_TOOLS = new Set<string>([
  'delete_channel',
  'delete_message',
  'delete_forum_post',
  'delete_webhook',
  'delete_role',
  'delete_thread',
  'kick_member',
  'ban_member',
  'timeout_member',
]);

/**
 * Whether the server is running in read-only mode (DISCORD_READONLY truthy).
 * Read at call time so tests and runtime config changes are honoured.
 */
export function isReadOnlyMode(): boolean {
  return ['1', 'true', 'yes', 'on'].includes(
    (process.env.DISCORD_READONLY ?? '').trim().toLowerCase(),
  );
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

export async function handleToolCall(
  client: Client,
  name: string,
  args: Args,
): Promise<ToolResult> {
  try {
    const handler = toolRegistry.get(name);
    if (!handler) throw new Error(`Unknown tool: "${name}"`);
    if (isReadOnlyMode() && !READ_ONLY_TOOLS.has(name)) {
      throw new Error(
        `Tool "${name}" is disabled: the server is running in read-only mode ` +
          `(DISCORD_READONLY is set). Only read-only tools are available.`,
      );
    }
    return await handler(client, args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
  }
}
