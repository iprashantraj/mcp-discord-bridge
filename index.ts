import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Collection,
  Interaction,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
  ActivityType,
} from 'discord.js';

// ─── Type Definitions ─────────────────────────────────────────────────────────

interface SlashCommand {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

// ─── Client Setup ─────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

// ─── Commands ─────────────────────────────────────────────────────────────────

const commands = new Collection<string, SlashCommand>();

const pingCommand: SlashCommand = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
  async execute(interaction) {
    const sent = await interaction.reply({ content: '🏓 Pinging...', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const wsLatency = interaction.client.ws.ping;

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('🏓 Pong!')
      .addFields(
        { name: 'Round-trip', value: `\`${latency}ms\``, inline: true },
        { name: 'WebSocket', value: `\`${wsLatency}ms\``, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ content: '', embeds: [embed] });
  },
};

const infoCommand: SlashCommand = {
  data: new SlashCommandBuilder().setName('info').setDescription('Show bot information'),
  async execute(interaction) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle('🤖 Discord MCP Server Bot')
      .setDescription(
        'A Model Context Protocol (MCP) bridge that lets AI assistants control this Discord server.',
      )
      .addFields(
        {
          name: '⏱ Uptime',
          value: `\`${hours}h ${minutes}m ${seconds}s\``,
          inline: true,
        },
        {
          name: '🏠 Guilds',
          value: `\`${client.guilds.cache.size}\``,
          inline: true,
        },
        {
          name: '📡 Latency',
          value: `\`${client.ws.ping}ms\``,
          inline: true,
        },
        {
          name: '📚 Tech Stack',
          value: 'discord.js v14 · TypeScript · MCP SDK',
          inline: false,
        },
      )
      .setFooter({ text: 'Powered by Model Context Protocol' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

const serverinfoCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Show information about this server'),
  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
      return;
    }

    const owner = await guild.fetchOwner();
    const channels = guild.channels.cache;
    const textChannels = channels.filter((c) => c.isTextBased()).size;
    const voiceChannels = channels.filter((c) => c.isVoiceBased()).size;

    const embed = new EmbedBuilder()
      .setColor(Colors.Gold)
      .setTitle(`📊 ${guild.name}`)
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: '👑 Owner', value: `${owner.user.tag}`, inline: true },
        { name: '👥 Members', value: `\`${guild.memberCount}\``, inline: true },
        { name: '🔰 Roles', value: `\`${guild.roles.cache.size}\``, inline: true },
        { name: '💬 Text Channels', value: `\`${textChannels}\``, inline: true },
        { name: '🔊 Voice Channels', value: `\`${voiceChannels}\``, inline: true },
        { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
      )
      .setFooter({ text: `ID: ${guild.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

commands.set(pingCommand.data.name, pingCommand);
commands.set(infoCommand.data.name, infoCommand);
commands.set(serverinfoCommand.data.name, serverinfoCommand);

// ─── Event Handlers ────────────────────────────────────────────────────────────

client.once('ready', (readyClient) => {
  console.log(`✅ Logged in as ${readyClient.user.tag}`);
  readyClient.user.setActivity('MCP Bridge | /info', { type: ActivityType.Watching });
});

client.on('interactionCreate', async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    await interaction.reply({ content: '❌ Unknown command.', ephemeral: true });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unknown error occurred.';
    const reply = { content: `❌ Error: ${message}`, ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// ─── Login with timeout guard ──────────────────────────────────────────────────

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const LOGIN_TIMEOUT_MS = 15_000;
const loginTimeout = setTimeout(() => {
  console.error('❌ Discord login timed out after 15s. Check your token and network.');
  process.exit(1);
}, LOGIN_TIMEOUT_MS);

client.login(token).then(() => clearTimeout(loginTimeout)).catch((err: Error) => {
  clearTimeout(loginTimeout);
  console.error(`❌ Login failed: ${err.message}`);
  process.exit(1);
});
