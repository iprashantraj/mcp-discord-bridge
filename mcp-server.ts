import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Client, GatewayIntentBits } from 'discord.js';
import { handleToolCall } from './mcp-handlers';

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

discordClient.on('error', (err) => {
  console.error(`⚠️ Discord client error (non-fatal): ${err.message}`);
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
  await Promise.race([
    new Promise<void>((resolve) => discordClient.once('clientReady', () => resolve())),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Discord not ready within 8s — proceeding anyway')), 8000),
    ),
  ]).catch(() => {/* timeout: continue and let Discord.js surface any real errors */});
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
          before: { type: 'string', description: 'Get messages before this message ID (cursor)' },
          after: { type: 'string', description: 'Get messages after this message ID (cursor)' },
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
  return handleToolCall(discordClient, name, args);
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
