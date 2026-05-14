import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { GatewayIntentBits } from 'discord.js';
import { createClient } from './discord-client';
import { handleToolCall } from './mcp-handlers';

// ─── Discord Client Setup ─────────────────────────────────────────────────────

const discordClient = createClient({
  extraIntents: [GatewayIntentBits.MessageContent],
});

let discordReady = false;

discordClient.once('clientReady', () => {
  discordReady = true;
  console.error(`✅ Discord connected as ${discordClient.user?.tag}`);
});

discordClient.on('error', (err) => {
  console.error(`⚠️ Discord client error (non-fatal): ${err.message}`);
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
    // ── Message enhancements ──
    {
      name: 'delete_message',
      description: 'Delete a message by channel and message ID',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string' },
          message_id: { type: 'string' },
        },
        required: ['channel_id', 'message_id'],
      },
    },
    {
      name: 'edit_message',
      description: 'Edit a bot message by channel and message ID',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string' },
          message_id: { type: 'string' },
          content: { type: 'string', description: 'New message content (max 2000 chars)' },
        },
        required: ['channel_id', 'message_id', 'content'],
      },
    },
    {
      name: 'search_messages',
      description: 'Search messages in a channel by keyword',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string' },
          query: { type: 'string', description: 'Search keyword' },
          limit: { type: 'number', description: 'Max results to return (1–100, default 50)' },
        },
        required: ['channel_id', 'query'],
      },
    },
    {
      name: 'send_dm',
      description: 'Send a direct message to a user',
      inputSchema: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          content: { type: 'string', description: 'Message content (max 2000 chars)' },
        },
        required: ['user_id', 'content'],
      },
    },
    {
      name: 'add_reaction',
      description: 'Add an emoji reaction to a message',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string' },
          message_id: { type: 'string' },
          emoji: { type: 'string', description: 'Emoji to react with (unicode or custom format)' },
        },
        required: ['channel_id', 'message_id', 'emoji'],
      },
    },
    {
      name: 'remove_reaction',
      description: 'Remove the bot\'s emoji reaction from a message',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string' },
          message_id: { type: 'string' },
          emoji: { type: 'string', description: 'Emoji to remove' },
        },
        required: ['channel_id', 'message_id', 'emoji'],
      },
    },
    {
      name: 'add_multiple_reactions',
      description: 'Add multiple emoji reactions to a message at once',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string' },
          message_id: { type: 'string' },
          emojis: { type: 'array', items: { type: 'string' }, description: 'Array of emojis to react with' },
        },
        required: ['channel_id', 'message_id', 'emojis'],
      },
    },
    // ── Forum channels ──
    {
      name: 'list_forum_channels',
      description: 'List all forum channels in a server',
      inputSchema: {
        type: 'object',
        properties: {
          guild_id: { type: 'string' },
        },
        required: ['guild_id'],
      },
    },
    {
      name: 'create_forum_post',
      description: 'Create a new forum post with title and content',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'Forum channel ID' },
          title: { type: 'string', description: 'Post title' },
          content: { type: 'string', description: 'Post body content' },
        },
        required: ['channel_id', 'title', 'content'],
      },
    },
    {
      name: 'get_forum_post',
      description: 'Fetch a forum post and its messages',
      inputSchema: {
        type: 'object',
        properties: {
          thread_id: { type: 'string', description: 'Forum post (thread) ID' },
          limit: { type: 'number', description: 'Number of messages to fetch (1–100, default 50)' },
        },
        required: ['thread_id'],
      },
    },
    {
      name: 'reply_to_forum_post',
      description: 'Reply to an existing forum post',
      inputSchema: {
        type: 'object',
        properties: {
          thread_id: { type: 'string', description: 'Forum post (thread) ID' },
          content: { type: 'string', description: 'Reply content (max 2000 chars)' },
        },
        required: ['thread_id', 'content'],
      },
    },
    {
      name: 'delete_forum_post',
      description: 'Delete a forum post',
      inputSchema: {
        type: 'object',
        properties: {
          thread_id: { type: 'string', description: 'Forum post (thread) ID' },
        },
        required: ['thread_id'],
      },
    },
    // ── Webhooks ──
    {
      name: 'create_webhook',
      description: 'Create a webhook for a channel',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string' },
          name: { type: 'string', description: 'Webhook name' },
        },
        required: ['channel_id', 'name'],
      },
    },
    {
      name: 'send_webhook_message',
      description: 'Send a message via a webhook',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string' },
          webhook_id: { type: 'string' },
          content: { type: 'string', description: 'Message content (max 2000 chars)' },
          username: { type: 'string', description: 'Override the webhook display name (optional)' },
        },
        required: ['channel_id', 'webhook_id', 'content'],
      },
    },
    {
      name: 'edit_webhook',
      description: 'Edit an existing webhook',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string' },
          webhook_id: { type: 'string' },
          name: { type: 'string', description: 'New webhook name' },
        },
        required: ['channel_id', 'webhook_id'],
      },
    },
    {
      name: 'delete_webhook',
      description: 'Delete a webhook',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string' },
          webhook_id: { type: 'string' },
        },
        required: ['channel_id', 'webhook_id'],
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
