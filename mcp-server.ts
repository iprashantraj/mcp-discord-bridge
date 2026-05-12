import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  Client,
  GatewayIntentBits,
  ChannelType,
  TextChannel,
  VoiceChannel,
  CategoryChannel,
  GuildBasedChannel,
  Collection,
  Role,
  GuildMember,
} from 'discord.js';

// ─── Discord Client Setup ─────────────────────────────────────────────────────

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

let discordReady = false;

discordClient.once('clientReady', () => {
  discordReady = true;
  console.error(`✅ Discord connected as ${discordClient.user?.tag}`);
});

// ─── Env Validation ───────────────────────────────────────────────────────────

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

// ─── Login with timeout guard ─────────────────────────────────────────────────

const LOGIN_TIMEOUT_MS = 15_000;
const loginTimeout = setTimeout(() => {
  console.error('❌ Discord login timed out after 15s. Check your token and network.');
  process.exit(1);
}, LOGIN_TIMEOUT_MS);

discordClient.login(token).then(() => clearTimeout(loginTimeout)).catch((err: Error) => {
  clearTimeout(loginTimeout);
  console.error(`❌ Discord login failed: ${err.message}`);
  process.exit(1);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function waitForDiscord(): Promise<void> {
  if (discordReady) return;
  await new Promise<void>((resolve) => discordClient.once('clientReady', () => resolve()));
}

/** Require a string arg, throw a descriptive error if missing or wrong type. */
function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing or invalid argument: "${key}" must be a non-empty string.`);
  }
  return value.trim();
}

/** Get an optional string arg. Returns undefined if missing. */
function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`Argument "${key}" must be a string.`);
  return value.trim() || undefined;
}

/** Get an optional number arg. Returns undefined if missing. */
function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number') throw new Error(`Argument "${key}" must be a number.`);
  return value;
}

/** Assert a channel is text-based (can send messages). */
function asTextChannel(channel: GuildBasedChannel | null): TextChannel {
  if (!channel) throw new Error('Channel not found.');
  if (!(channel instanceof TextChannel)) throw new Error(`Channel "${channel.name}" is not a text channel.`);
  return channel;
}

/** Resolve a guild channel with type narrowing. */
async function fetchGuildChannel(channelId: string): Promise<GuildBasedChannel> {
  const channel = await discordClient.channels.fetch(channelId);
  if (!channel) throw new Error(`Channel with ID "${channelId}" not found.`);
  if (!channel.isThread() && 'guild' in channel) return channel as GuildBasedChannel;
  throw new Error(`Channel "${channelId}" is not a guild channel.`);
}

function ok(text: string): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text' as const, text }] };
}

function formatMembers(members: Collection<string, GuildMember>): object[] {
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

// ─── MCP Server Setup ─────────────────────────────────────────────────────────

const server = new Server(
  { name: 'discord-mcp-server', version: '1.1.0' },
  { capabilities: { tools: {} } },
);

// ─── Tool Definitions ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Server ──
    {
      name: 'list_guilds',
      description: 'List all Discord servers the bot is in',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'list_channels',
      description: 'List all channels and categories in a Discord server',
      inputSchema: {
        type: 'object',
        properties: {
          guild_id: { type: 'string', description: 'The Discord server (guild) ID' },
        },
        required: ['guild_id'],
      },
    },
    // ── Channel management ──
    {
      name: 'create_category',
      description: 'Create a new category in a Discord server',
      inputSchema: {
        type: 'object',
        properties: {
          guild_id: { type: 'string' },
          name: { type: 'string', description: 'Category name' },
          position: { type: 'number', description: 'Position (0 = top)' },
        },
        required: ['guild_id', 'name'],
      },
    },
    {
      name: 'create_channel',
      description: 'Create a text or voice channel, optionally inside a category',
      inputSchema: {
        type: 'object',
        properties: {
          guild_id: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string', enum: ['text', 'voice'], default: 'text' },
          category_id: { type: 'string', description: 'Parent category ID (optional)' },
          topic: { type: 'string', description: 'Channel topic (text channels only, optional)' },
        },
        required: ['guild_id', 'name'],
      },
    },
    {
      name: 'delete_channel',
      description: 'Delete a channel or category by ID',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string' },
          reason: { type: 'string', description: 'Audit log reason (optional)' },
        },
        required: ['channel_id'],
      },
    },
    {
      name: 'move_channel',
      description: 'Move a channel into a different category',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string' },
          category_id: {
            type: 'string',
            description: 'Target category ID — omit or leave empty to remove from category',
          },
        },
        required: ['channel_id'],
      },
    },
    {
      name: 'rename_channel',
      description: 'Rename a channel or category',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string' },
          name: { type: 'string' },
          reason: { type: 'string', description: 'Audit log reason (optional)' },
        },
        required: ['channel_id', 'name'],
      },
    },
    // ── Messages ──
    {
      name: 'get_channel_messages',
      description: 'Fetch recent messages from a text channel',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string' },
          limit: { type: 'number', description: 'Number of messages to fetch (1–100, default 50)' },
        },
        required: ['channel_id'],
      },
    },
    {
      name: 'send_message',
      description: 'Send a message to a Discord text channel',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string' },
          content: { type: 'string', description: 'The message text to send (max 2000 chars)' },
        },
        required: ['channel_id', 'content'],
      },
    },
    // ── Members ──
    {
      name: 'list_members',
      description: 'List members in a Discord server (up to 1000)',
      inputSchema: {
        type: 'object',
        properties: {
          guild_id: { type: 'string' },
          limit: { type: 'number', description: 'Max members to return (1–1000, default 100)' },
        },
        required: ['guild_id'],
      },
    },
    {
      name: 'get_member',
      description: 'Get detailed information about a specific guild member',
      inputSchema: {
        type: 'object',
        properties: {
          guild_id: { type: 'string' },
          user_id: { type: 'string' },
        },
        required: ['guild_id', 'user_id'],
      },
    },
    // ── Roles ──
    {
      name: 'list_roles',
      description: 'List all roles in a Discord server',
      inputSchema: {
        type: 'object',
        properties: {
          guild_id: { type: 'string' },
        },
        required: ['guild_id'],
      },
    },
    {
      name: 'assign_role',
      description: 'Assign a role to a guild member',
      inputSchema: {
        type: 'object',
        properties: {
          guild_id: { type: 'string' },
          user_id: { type: 'string' },
          role_id: { type: 'string' },
          reason: { type: 'string', description: 'Audit log reason (optional)' },
        },
        required: ['guild_id', 'user_id', 'role_id'],
      },
    },
    {
      name: 'remove_role',
      description: 'Remove a role from a guild member',
      inputSchema: {
        type: 'object',
        properties: {
          guild_id: { type: 'string' },
          user_id: { type: 'string' },
          role_id: { type: 'string' },
          reason: { type: 'string', description: 'Audit log reason (optional)' },
        },
        required: ['guild_id', 'user_id', 'role_id'],
      },
    },
  ],
}));

// ─── Tool Handlers ─────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  await waitForDiscord();

  const { name, arguments: rawArgs } = request.params;
  const args = (rawArgs ?? {}) as Record<string, unknown>;

  try {
    // ── Server tools ──────────────────────────────────────────────────────────

    if (name === 'list_guilds') {
      const guilds = discordClient.guilds.cache.map((g) => ({
        id: g.id,
        name: g.name,
        memberCount: g.memberCount,
      }));
      return ok(JSON.stringify(guilds, null, 2));
    }

    if (name === 'list_channels') {
      const guildId = requireString(args, 'guild_id');
      const guild = await discordClient.guilds.fetch(guildId);
      const channels = await guild.channels.fetch();
      const result = [...channels.values()]
        .filter((ch) => ch !== null)
        .map((ch) => {
          // ch is non-null after filter; cast to access common guild channel properties safely
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
    }

    // ── Channel management ─────────────────────────────────────────────────────

    if (name === 'create_category') {
      const guildId = requireString(args, 'guild_id');
      const catName = requireString(args, 'name');
      const position = optionalNumber(args, 'position');
      const guild = await discordClient.guilds.fetch(guildId);
      const cat = await guild.channels.create({
        name: catName,
        type: ChannelType.GuildCategory,
        ...(position !== undefined && { position }),
      });
      return ok(`Created category "${cat.name}" (ID: ${cat.id})`);
    }

    if (name === 'create_channel') {
      const guildId = requireString(args, 'guild_id');
      const channelName = requireString(args, 'name');
      const isVoice = args['type'] === 'voice';
      const categoryId = optionalString(args, 'category_id');
      const topic = optionalString(args, 'topic');
      const guild = await discordClient.guilds.fetch(guildId);
      const ch = await guild.channels.create({
        name: channelName,
        type: isVoice ? ChannelType.GuildVoice : ChannelType.GuildText,
        ...(categoryId && { parent: categoryId }),
        ...(!isVoice && topic && { topic }),
      });
      return ok(`Created ${isVoice ? 'voice' : 'text'} channel "#${ch.name}" (ID: ${ch.id})`);
    }

    if (name === 'delete_channel') {
      const channelId = requireString(args, 'channel_id');
      const reason = optionalString(args, 'reason');
      const ch = await fetchGuildChannel(channelId);
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
    }

    if (name === 'move_channel') {
      const channelId = requireString(args, 'channel_id');
      const categoryId = optionalString(args, 'category_id');
      const ch = await fetchGuildChannel(channelId);
      if (ch instanceof TextChannel || ch instanceof VoiceChannel) {
        await ch.setParent(categoryId ?? null);
      } else {
        throw new Error('Only text or voice channels can be moved into a category.');
      }
      return ok(`Moved channel to category ${categoryId ?? 'none'}`);
    }

    if (name === 'rename_channel') {
      const channelId = requireString(args, 'channel_id');
      const newName = requireString(args, 'name');
      const reason = optionalString(args, 'reason');
      const ch = await fetchGuildChannel(channelId);
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
    }

    // ── Message tools ──────────────────────────────────────────────────────────

    if (name === 'get_channel_messages') {
      const channelId = requireString(args, 'channel_id');
      const rawLimit = optionalNumber(args, 'limit');
      const limit = Math.min(Math.max(rawLimit ?? 50, 1), 100);
      const ch = await fetchGuildChannel(channelId);
      const textCh = asTextChannel(ch);
      const messages = await textCh.messages.fetch({ limit });
      const result = [...messages.values()].reverse().map((m) => ({
        id: m.id,
        author: m.author.username,
        content: m.content,
        timestamp: m.createdAt.toISOString(),
        attachments: m.attachments.size,
      }));
      return ok(JSON.stringify(result, null, 2));
    }

    if (name === 'send_message') {
      const channelId = requireString(args, 'channel_id');
      const content = requireString(args, 'content');
      if (content.length > 2000) {
        throw new Error('Message content exceeds Discord\'s 2000 character limit.');
      }
      const ch = await fetchGuildChannel(channelId);
      const textCh = asTextChannel(ch);
      const sent = await textCh.send(content);
      return ok(`Message sent (ID: ${sent.id}) to channel ${channelId}`);
    }

    // ── Member tools ──────────────────────────────────────────────────────────

    if (name === 'list_members') {
      const guildId = requireString(args, 'guild_id');
      const rawLimit = optionalNumber(args, 'limit');
      const limit = Math.min(Math.max(rawLimit ?? 100, 1), 1000);
      const guild = await discordClient.guilds.fetch(guildId);
      const members = await guild.members.fetch({ limit });
      return ok(JSON.stringify(formatMembers(members), null, 2));
    }

    if (name === 'get_member') {
      const guildId = requireString(args, 'guild_id');
      const userId = requireString(args, 'user_id');
      const guild = await discordClient.guilds.fetch(guildId);
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
    }

    // ── Role tools ────────────────────────────────────────────────────────────

    if (name === 'list_roles') {
      const guildId = requireString(args, 'guild_id');
      const guild = await discordClient.guilds.fetch(guildId);
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
    }

    if (name === 'assign_role') {
      const guildId = requireString(args, 'guild_id');
      const userId = requireString(args, 'user_id');
      const roleId = requireString(args, 'role_id');
      const reason = optionalString(args, 'reason');
      const guild = await discordClient.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);
      const role = await guild.roles.fetch(roleId);
      if (!role) throw new Error(`Role with ID "${roleId}" not found.`);
      await member.roles.add(role, reason);
      return ok(`Assigned role "${role.name}" to ${member.user.username}`);
    }

    if (name === 'remove_role') {
      const guildId = requireString(args, 'guild_id');
      const userId = requireString(args, 'user_id');
      const roleId = requireString(args, 'role_id');
      const reason = optionalString(args, 'reason');
      const guild = await discordClient.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);
      const role = await guild.roles.fetch(roleId);
      if (!role) throw new Error(`Role with ID "${roleId}" not found.`);
      await member.roles.remove(role, reason);
      return ok(`Removed role "${role.name}" from ${member.user.username}`);
    }

    throw new Error(`Unknown tool: "${name}"`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
  }
});

// ─── Start MCP Server ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🚀 Discord MCP server started (stdio)');
}

main().catch((err: Error) => {
  console.error(`Fatal error starting MCP server: ${err.message}`);
  process.exit(1);
});
