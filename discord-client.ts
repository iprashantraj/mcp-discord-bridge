import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

// ─── Connection State ────────────────────────────────────────────────────────

let connectionError: string | null = null;

/**
 * Returns a human-readable connection error if Discord login is not / will not be available,
 * or null if the client is either connected or still attempting to connect.
 * Use this from MCP handlers to surface clear errors back to the AI client instead of
 * silently exiting the process.
 */
export function getConnectionError(): string | null {
  return connectionError;
}

// ─── Client Factory ──────────────────────────────────────────────────────────

export interface CreateClientOptions {
  /** Extra intents beyond the defaults (Guilds, GuildMessages, GuildMembers). */
  extraIntents?: GatewayIntentBits[];
}

const DEFAULT_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMembers,
];

const TOKEN_MISSING_MESSAGE =
  'DISCORD_TOKEN is not set. Add it to the "env" block of your MCP client config, e.g. ' +
  '"env": { "DISCORD_TOKEN": "your_bot_token_here" }. ' +
  'Get a token at https://discord.com/developers/applications (Bot tab → Reset Token).';

/**
 * Create a Discord client and start login.
 * Never exits the process. If the token is missing or login fails, the error is recorded
 * via getConnectionError() so tool handlers can return a clean MCP error to the user.
 */
export function createClient(options: CreateClientOptions = {}): Client {
  const intents = [...DEFAULT_INTENTS, ...(options.extraIntents ?? [])];
  const client = new Client({ intents });

  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    connectionError = TOKEN_MISSING_MESSAGE;
    console.error(`❌ ${TOKEN_MISSING_MESSAGE}`);
    return client;
  }

  const LOGIN_TIMEOUT_MS = 15_000;
  const loginTimeout = setTimeout(() => {
    connectionError = 'Discord login timed out after 15s. Check your token and network.';
    console.error(`❌ ${connectionError}`);
  }, LOGIN_TIMEOUT_MS);

  client.login(token).then(() => clearTimeout(loginTimeout)).catch((err: Error) => {
    clearTimeout(loginTimeout);
    connectionError = `Discord login failed: ${err.message}`;
    console.error(`❌ ${connectionError}`);
  });

  return client;
}
