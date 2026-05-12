import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

/**
 * Run this script once to register slash commands with Discord.
 * Usage: npm run deploy-commands
 *
 * Registers commands to a specific guild (instant) rather than globally (up to 1h delay).
 */

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;
const clientId = process.env.CLIENT_ID;

if (!token || !guildId || !clientId) {
  console.error(
    '❌ Missing environment variables. Ensure DISCORD_TOKEN, GUILD_ID, and CLIENT_ID are set in .env',
  );
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
  new SlashCommandBuilder().setName('info').setDescription('Show bot information'),
  new SlashCommandBuilder().setName('serverinfo').setDescription('Show information about this server'),
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('🔄 Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log('✅ Slash commands registered successfully.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Failed to register commands: ${message}`);
    process.exit(1);
  }
})();
