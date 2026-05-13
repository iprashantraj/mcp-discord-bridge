import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

// ─── Token Validation ────────────────────────────────────────────────────────

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
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

/**
 * Create a Discord client, log in, and return it.
 * Exits the process if login fails or times out (15s).
 */
export function createClient(options: CreateClientOptions = {}): Client {
  const intents = [...DEFAULT_INTENTS, ...(options.extraIntents ?? [])];
  const client = new Client({ intents });

  const LOGIN_TIMEOUT_MS = 15_000;
  const loginTimeout = setTimeout(() => {
    console.error('❌ Discord login timed out after 15s. Check your token and network.');
    process.exit(1);
  }, LOGIN_TIMEOUT_MS);

  client.login(token).then(() => clearTimeout(loginTimeout)).catch((err: Error) => {
    clearTimeout(loginTimeout);
    console.error(`❌ Discord login failed: ${err.message}`);
    process.exit(1);
  });

  return client;
}
