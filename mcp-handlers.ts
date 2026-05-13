import {
  Client,
  ChannelType,
  TextChannel,
  VoiceChannel,
  CategoryChannel,
  GuildBasedChannel,
  Collection,
  Role,
  GuildMember,
  PermissionsBitField,
  Guild,
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

/** Assert a channel is text-based (can send messages). */
export function asTextChannel(channel: GuildBasedChannel | null): TextChannel {
  if (!channel) throw new Error('Channel not found.');
  if (!(channel instanceof TextChannel)) throw new Error(`Channel "${channel.name}" is not a text channel.`);
  return channel;
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
  // Members
  ['list_members', listMembers],
  ['get_member', getMember],
  // Roles
  ['list_roles', listRoles],
  ['assign_role', assignRole],
  ['remove_role', removeRole],
]);

// ─── Entry Point ─────────────────────────────────────────────────────────────

export async function handleToolCall(
  client: Client,
  name: string,
  args: Args,
): Promise<ToolResult> {
  try {
    const handler = toolRegistry.get(name);
    if (!handler) throw new Error(`Unknown tool: "${name}"`);
    return await handler(client, args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
  }
}
