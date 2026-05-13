import { describe, it, expect, vi } from 'vitest';
import { handleToolCall } from '../mcp-handlers';
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
