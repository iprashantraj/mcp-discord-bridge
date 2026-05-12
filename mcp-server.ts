import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Client, GatewayIntentBits, ChannelType, PermissionsBitField } from 'discord.js';

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let discordReady = false;

discordClient.once('clientReady', () => {
  discordReady = true;
  console.error(`Discord connected as ${discordClient.user?.tag}`);
});

discordClient.login(process.env.DISCORD_TOKEN);

async function waitForDiscord(): Promise<void> {
  if (discordReady) return;
  await new Promise<void>((resolve) => discordClient.once('clientReady', () => resolve()));
}

const server = new Server(
  { name: 'discord-bot', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
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
      description: 'Create a text or voice channel inside a category',
      inputSchema: {
        type: 'object',
        properties: {
          guild_id: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string', enum: ['text', 'voice'], default: 'text' },
          category_id: { type: 'string', description: 'Parent category ID (optional)' },
          topic: { type: 'string', description: 'Channel topic/description (optional)' },
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
          category_id: { type: 'string', description: 'Target category ID, or empty to remove from category' },
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
        },
        required: ['channel_id', 'name'],
      },
    },
    {
      name: 'list_guilds',
      description: 'List all Discord servers the bot is in',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_channel_messages',
      description: 'Fetch recent messages from a text channel',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The text channel ID' },
          limit: { type: 'number', description: 'Number of messages to fetch (max 100, default 100)' },
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
          channel_id: { type: 'string', description: 'The text channel ID' },
          content: { type: 'string', description: 'The message text to send' },
        },
        required: ['channel_id', 'content'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  await waitForDiscord();
  const { name, arguments: args } = request.params;

  try {
    if (name === 'list_guilds') {
      const guilds = discordClient.guilds.cache.map((g) => ({
        id: g.id,
        name: g.name,
        memberCount: g.memberCount,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(guilds, null, 2) }] };
    }

    if (name === 'list_channels') {
      const guild = await discordClient.guilds.fetch(args!.guild_id as string);
      const channels = await guild.channels.fetch();
      const result = channels.map((ch) => ({
        id: ch!.id,
        name: ch!.name,
        type: ChannelType[ch!.type],
        parentId: (ch as any).parentId ?? null,
        position: (ch as any).position ?? null,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    if (name === 'create_category') {
      const guild = await discordClient.guilds.fetch(args!.guild_id as string);
      const cat = await guild.channels.create({
        name: args!.name as string,
        type: ChannelType.GuildCategory,
        position: args!.position as number | undefined,
      });
      return { content: [{ type: 'text', text: `Created category "${cat.name}" (ID: ${cat.id})` }] };
    }

    if (name === 'create_channel') {
      const guild = await discordClient.guilds.fetch(args!.guild_id as string);
      const isVoice = args!.type === 'voice';
      const ch = await guild.channels.create({
        name: args!.name as string,
        type: isVoice ? ChannelType.GuildVoice : ChannelType.GuildText,
        parent: args!.category_id as string | undefined,
        topic: (!isVoice && args!.topic) ? args!.topic as string : undefined,
      });
      return { content: [{ type: 'text', text: `Created ${isVoice ? 'voice' : 'text'} channel "#${ch.name}" (ID: ${ch.id})` }] };
    }

    if (name === 'delete_channel') {
      const ch = await discordClient.channels.fetch(args!.channel_id as string);
      if (!ch) throw new Error('Channel not found');
      await (ch as any).delete();
      return { content: [{ type: 'text', text: `Deleted channel/category (ID: ${args!.channel_id})` }] };
    }

    if (name === 'move_channel') {
      const ch = await discordClient.channels.fetch(args!.channel_id as string);
      if (!ch) throw new Error('Channel not found');
      await (ch as any).setParent(args!.category_id ?? null);
      return { content: [{ type: 'text', text: `Moved channel to category ${args!.category_id ?? 'none'}` }] };
    }

    if (name === 'rename_channel') {
      const ch = await discordClient.channels.fetch(args!.channel_id as string);
      if (!ch) throw new Error('Channel not found');
      await (ch as any).setName(args!.name as string);
      return { content: [{ type: 'text', text: `Renamed to "${args!.name}"` }] };
    }

    if (name === 'get_channel_messages') {
      const ch = await discordClient.channels.fetch(args!.channel_id as string);
      if (!ch || !(ch as any).messages) throw new Error('Channel not found or not a text channel');
      const limit = Math.min((args!.limit as number) || 100, 100);
      const messages = await (ch as any).messages.fetch({ limit });
      const result = messages.map((m: any) => ({
        author: m.author.username,
        content: m.content,
        timestamp: m.createdAt.toISOString(),
      }));
      return { content: [{ type: 'text', text: JSON.stringify([...result.values()].reverse(), null, 2) }] };
    }

    if (name === 'send_message') {
      const ch = await discordClient.channels.fetch(args!.channel_id as string);
      if (!ch || !(ch as any).send) throw new Error('Channel not found or not a text channel');
      await (ch as any).send(args!.content as string);
      return { content: [{ type: 'text', text: `Message sent to channel ${args!.channel_id}` }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Discord MCP server started');
}

main();
