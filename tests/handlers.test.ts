import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  handleToolCall,
  isReadOnlyMode,
  READ_ONLY_TOOLS,
  DESTRUCTIVE_TOOLS,
} from '../mcp-handlers';
import type { Client } from 'discord.js';

// ─── Mock Factories ──────────────────────────────────────────────────────────

function mockClient(overrides: Partial<Client> = {}): Client {
  return {
    guilds: {
      cache: new Map(),
      fetch: vi.fn(),
    },
    channels: {
      fetch: vi.fn(),
    },
    ...overrides,
  } as unknown as Client;
}

function mockGuild(overrides: Record<string, unknown> = {}) {
  return {
    id: '111',
    name: 'Test Server',
    memberCount: 10,
    channels: { fetch: vi.fn(), create: vi.fn() },
    members: { me: null, fetch: vi.fn() },
    roles: { fetch: vi.fn() },
    ...overrides,
  };
}

// ─── Unknown tool ────────────────────────────────────────────────────────────

describe('handleToolCall', () => {
  it('returns error for unknown tool', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'nonexistent_tool', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown tool');
  });

  // ── list_guilds ──────────────────────────────────────────────────────────

  it('list_guilds returns cached guilds', async () => {
    const guildsMap = new Map([
      ['111', { id: '111', name: 'Server A', memberCount: 5 }],
      ['222', { id: '222', name: 'Server B', memberCount: 12 }],
    ]);
    // discord.js Collection.map works like Array.map via the cache
    const cache = {
      map: (fn: (g: { id: string; name: string; memberCount: number }) => unknown) =>
        [...guildsMap.values()].map(fn),
    };
    const client = mockClient({ guilds: { cache } } as unknown as Partial<Client>);

    const result = await handleToolCall(client, 'list_guilds', {});
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe('Server A');
    expect(parsed[1].memberCount).toBe(12);
  });

  // ── list_channels ────────────────────────────────────────────────────────

  it('list_channels returns channel list', async () => {
    const channels = new Map([
      ['c1', { id: 'c1', name: 'general', type: 0, parentId: null, position: 0 }],
      ['c2', { id: 'c2', name: 'voice', type: 2, parentId: 'cat1', position: 1 }],
    ]);
    const guild = mockGuild({
      channels: {
        fetch: vi.fn().mockResolvedValue(channels),
      },
    });
    const client = mockClient();
    (client.guilds.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(guild);

    const result = await handleToolCall(client, 'list_channels', { guild_id: '111' });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe('general');
  });

  // ── list_channels missing guild_id ───────────────────────────────────────

  it('list_channels throws on missing guild_id', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'list_channels', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('guild_id');
  });

  // ── send_message ─────────────────────────────────────────────────────────

  it('send_message rejects content over 2000 chars', async () => {
    const client = mockClient();
    // Need to mock fetchGuildChannel path — channel fetch
    const mockTextChannel = {
      id: 'ch1',
      name: 'general',
      guild: mockGuild(),
      isThread: () => false,
      send: vi.fn(),
    };
    (client.channels.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockTextChannel);

    const longContent = 'x'.repeat(2001);
    const result = await handleToolCall(client, 'send_message', {
      channel_id: 'ch1',
      content: longContent,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('2000 character limit');
  });

  // ── send_message missing content ─────────────────────────────────────────

  it('send_message throws on missing content', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'send_message', { channel_id: 'ch1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"content"');
  });

  // ── list_members ─────────────────────────────────────────────────────────

  it('list_members clamps limit to valid range', async () => {
    const membersCollection = {
      map: vi.fn().mockReturnValue([]),
    };
    const guild = mockGuild({
      members: {
        me: null,
        fetch: vi.fn().mockResolvedValue(membersCollection),
      },
    });
    const client = mockClient();
    (client.guilds.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(guild);

    // Pass a limit of 9999 — should be clamped to 1000
    await handleToolCall(client, 'list_members', { guild_id: '111', limit: 9999 });
    expect(guild.members.fetch).toHaveBeenCalledWith({ limit: 1000 });
  });

  it('list_members defaults limit to 100', async () => {
    const membersCollection = {
      map: vi.fn().mockReturnValue([]),
    };
    const guild = mockGuild({
      members: {
        me: null,
        fetch: vi.fn().mockResolvedValue(membersCollection),
      },
    });
    const client = mockClient();
    (client.guilds.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(guild);

    await handleToolCall(client, 'list_members', { guild_id: '111' });
    expect(guild.members.fetch).toHaveBeenCalledWith({ limit: 100 });
  });

  // ── delete_message ───────────────────────────────────────────────────────

  it('delete_message requires channel_id and message_id', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'delete_message', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('channel_id');
  });

  // ── edit_message ────────────────────────────────────────────────────────

  it('edit_message rejects content over 2000 chars', async () => {
    const client = mockClient();
    const mockTextChannel = {
      id: 'ch1', name: 'general', guild: mockGuild(),
      isThread: () => false,
      messages: { fetch: vi.fn() },
    };
    (client.channels.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockTextChannel);

    const result = await handleToolCall(client, 'edit_message', {
      channel_id: 'ch1', message_id: 'msg1', content: 'x'.repeat(2001),
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('2000 character limit');
  });

  // ── search_messages ─────────────────────────────────────────────────────

  it('search_messages requires query', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'search_messages', { channel_id: 'ch1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('query');
  });

  // ── send_dm ─────────────────────────────────────────────────────────────

  it('send_dm rejects content over 2000 chars', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'send_dm', {
      user_id: 'u1', content: 'x'.repeat(2001),
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('2000 character limit');
  });

  it('send_dm requires user_id', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'send_dm', { content: 'hello' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('user_id');
  });

  // ── add_reaction ────────────────────────────────────────────────────────

  it('add_reaction requires all args', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'add_reaction', { channel_id: 'ch1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('message_id');
  });

  // ── add_multiple_reactions ──────────────────────────────────────────────

  it('add_multiple_reactions rejects non-array emojis', async () => {
    const client = mockClient();
    const mockTextChannel = {
      id: 'ch1', name: 'general', guild: mockGuild(),
      isThread: () => false,
      messages: { fetch: vi.fn().mockResolvedValue({ react: vi.fn() }) },
    };
    (client.channels.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockTextChannel);

    const result = await handleToolCall(client, 'add_multiple_reactions', {
      channel_id: 'ch1', message_id: 'msg1', emojis: 'not-an-array',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('non-empty array');
  });

  it('add_multiple_reactions rejects empty array', async () => {
    const client = mockClient();
    const mockTextChannel = {
      id: 'ch1', name: 'general', guild: mockGuild(),
      isThread: () => false,
      messages: { fetch: vi.fn() },
    };
    (client.channels.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockTextChannel);

    const result = await handleToolCall(client, 'add_multiple_reactions', {
      channel_id: 'ch1', message_id: 'msg1', emojis: [],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('non-empty array');
  });

  // ── create_forum_post ───────────────────────────────────────────────────

  it('create_forum_post rejects non-forum channel', async () => {
    const client = mockClient();
    (client.channels.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      type: 0, // GuildText, not Forum
    });

    const result = await handleToolCall(client, 'create_forum_post', {
      channel_id: 'ch1', title: 'Test', content: 'Body',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not a forum channel');
  });

  // ── get_forum_post ──────────────────────────────────────────────────────

  it('get_forum_post rejects non-thread channel', async () => {
    const client = mockClient();
    (client.channels.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      isThread: () => false,
    });

    const result = await handleToolCall(client, 'get_forum_post', { thread_id: 't1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not a thread');
  });

  // ── reply_to_forum_post ─────────────────────────────────────────────────

  it('reply_to_forum_post rejects content over 2000 chars', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'reply_to_forum_post', {
      thread_id: 't1', content: 'x'.repeat(2001),
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('2000 character limit');
  });

  // ── create_webhook ──────────────────────────────────────────────────────

  it('create_webhook requires channel_id and name', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'create_webhook', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('channel_id');
  });

  // ── send_webhook_message ────────────────────────────────────────────────

  it('send_webhook_message rejects content over 2000 chars', async () => {
    const client = mockClient();
    const mockTextChannel = {
      id: 'ch1', name: 'general', guild: mockGuild(),
      isThread: () => false,
    };
    (client.channels.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockTextChannel);

    const result = await handleToolCall(client, 'send_webhook_message', {
      channel_id: 'ch1', webhook_id: 'wh1', content: 'x'.repeat(2001),
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('2000 character limit');
  });

  // ── kick_member ──────────────────────────────────────────────────────────

  it('kick_member requires guild_id and user_id', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'kick_member', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('guild_id');
  });

  // ── ban_member ──────────────────────────────────────────────────────────

  it('ban_member requires guild_id', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'ban_member', { user_id: 'u1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('guild_id');
  });

  // ── unban_member ────────────────────────────────────────────────────────

  it('unban_member requires user_id', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'unban_member', { guild_id: '111' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('user_id');
  });

  // ── timeout_member ──────────────────────────────────────────────────────

  it('timeout_member requires guild_id and user_id', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'timeout_member', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('guild_id');
  });

  // ── set_nickname ────────────────────────────────────────────────────────

  it('set_nickname requires guild_id and user_id', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'set_nickname', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('guild_id');
  });

  // ── create_role ─────────────────────────────────────────────────────────

  it('create_role requires guild_id and name', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'create_role', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('guild_id');
  });

  // ── edit_role ───────────────────────────────────────────────────────────

  it('edit_role requires guild_id and role_id', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'edit_role', { guild_id: '111' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('role_id');
  });

  // ── delete_role ─────────────────────────────────────────────────────────

  it('delete_role requires guild_id and role_id', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'delete_role', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('guild_id');
  });

  // ── create_thread ───────────────────────────────────────────────────────

  it('create_thread requires channel_id and name', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'create_thread', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('channel_id');
  });

  // ── list_threads ────────────────────────────────────────────────────────

  it('list_threads requires channel_id', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'list_threads', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('channel_id');
  });

  // ── archive_thread ──────────────────────────────────────────────────────

  it('archive_thread rejects non-thread channel', async () => {
    const client = mockClient();
    (client.channels.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      isThread: () => false,
    });

    const result = await handleToolCall(client, 'archive_thread', { thread_id: 't1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not a thread');
  });

  // ── unarchive_thread ────────────────────────────────────────────────────

  it('unarchive_thread requires thread_id', async () => {
    const client = mockClient();
    const result = await handleToolCall(client, 'unarchive_thread', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('thread_id');
  });

  // ── join_thread ─────────────────────────────────────────────────────────

  it('join_thread rejects non-thread channel', async () => {
    const client = mockClient();
    (client.channels.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      isThread: () => false,
    });

    const result = await handleToolCall(client, 'join_thread', { thread_id: 't1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not a thread');
  });

  // ── delete_thread ───────────────────────────────────────────────────────

  it('delete_thread rejects non-thread channel', async () => {
    const client = mockClient();
    (client.channels.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      isThread: () => false,
    });

    const result = await handleToolCall(client, 'delete_thread', { thread_id: 't1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not a thread');
  });

  // ── Error wrapping ──────────────────────────────────────────────────────

  it('wraps thrown errors in isError response', async () => {
    const client = mockClient();
    (client.guilds.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('API down'),
    );

    const result = await handleToolCall(client, 'list_channels', { guild_id: '111' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: API down');
  });
});

// ─── Read-only mode ────────────────────────────────────────────────────────────

describe('read-only mode', () => {
  afterEach(() => {
    delete process.env.DISCORD_READONLY;
  });

  it('isReadOnlyMode reflects the env var', () => {
    expect(isReadOnlyMode()).toBe(false);
    process.env.DISCORD_READONLY = 'true';
    expect(isReadOnlyMode()).toBe(true);
    process.env.DISCORD_READONLY = '0';
    expect(isReadOnlyMode()).toBe(false);
  });

  it('blocks write/destructive tools when enabled', async () => {
    process.env.DISCORD_READONLY = '1';
    const client = mockClient();
    const result = await handleToolCall(client, 'ban_member', {
      guild_id: '111',
      user_id: 'u1',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('read-only mode');
  });

  it('still allows read-only tools when enabled', async () => {
    process.env.DISCORD_READONLY = '1';
    const guildsMap = new Map([['111', { id: '111', name: 'A', memberCount: 1 }]]);
    const cache = {
      map: (fn: (g: { id: string; name: string; memberCount: number }) => unknown) =>
        [...guildsMap.values()].map(fn),
    };
    const client = mockClient({ guilds: { cache } } as unknown as Partial<Client>);
    const result = await handleToolCall(client, 'list_guilds', {});
    expect(result.isError).toBeUndefined();
  });

  it('read-only and destructive sets do not overlap', () => {
    for (const name of DESTRUCTIVE_TOOLS) {
      expect(READ_ONLY_TOOLS.has(name)).toBe(false);
    }
  });
});

// ─── Limit clamping ────────────────────────────────────────────────────────────

describe('moderation limit clamping', () => {
  it('ban_member clamps delete_message_days to 7', async () => {
    const ban = vi.fn().mockResolvedValue(undefined);
    const guild = mockGuild({ members: { me: null, fetch: vi.fn(), ban } });
    const client = mockClient();
    (client.guilds.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(guild);

    await handleToolCall(client, 'ban_member', {
      guild_id: '111',
      user_id: 'u1',
      delete_message_days: 99,
    });
    expect(ban).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ deleteMessageSeconds: 7 * 86400 }),
    );
  });

  it('timeout_member clamps duration to 28 days', async () => {
    const timeout = vi.fn().mockResolvedValue(undefined);
    const member = { user: { username: 'bob' }, timeout };
    const guild = mockGuild({
      members: { me: null, fetch: vi.fn().mockResolvedValue(member) },
    });
    const client = mockClient();
    (client.guilds.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(guild);

    await handleToolCall(client, 'timeout_member', {
      guild_id: '111',
      user_id: 'u1',
      duration_minutes: 999999,
    });
    expect(timeout).toHaveBeenCalledWith(40320 * 60 * 1000, undefined);
  });
});
