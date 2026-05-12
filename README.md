# 🤖 Discord MCP Server

A **Model Context Protocol (MCP) server** that gives AI assistants (like Claude) the ability to interact with and control Discord servers — manage channels, read messages, manage members, assign roles, and more.

Built with **TypeScript**, **discord.js v14**, and the **MCP SDK**.

---

## ✨ Features

### MCP Tools (for AI integration)

| Category | Tool | Description |
|---|---|---|
| **Server** | `list_guilds` | List all Discord servers the bot is in |
| | `list_channels` | List all channels and categories in a server |
| **Channels** | `create_category` | Create a new category |
| | `create_channel` | Create a text or voice channel (optionally inside a category) |
| | `delete_channel` | Delete a channel or category by ID |
| | `move_channel` | Move a channel into a different category |
| | `rename_channel` | Rename a channel or category |
| **Messages** | `get_channel_messages` | Fetch recent messages from a text channel |
| | `send_message` | Send a message to a text channel |
| **Members** | `list_members` | List members in a server (with roles) |
| | `get_member` | Get detailed info about a specific member |
| **Roles** | `list_roles` | List all roles in a server |
| | `assign_role` | Assign a role to a member |
| | `remove_role` | Remove a role from a member |

### Slash Commands (standalone bot mode)

| Command | Description |
|---|---|
| `/ping` | Check bot latency (round-trip + WebSocket) |
| `/info` | Show bot uptime, guild count, and tech stack |
| `/serverinfo` | Show detailed server info (owner, members, channels) |

---

## 🧰 Tech Stack

- [discord.js](https://discord.js.org/) v14
- [@modelcontextprotocol/sdk](https://modelcontextprotocol.io/)
- TypeScript + ts-node
- ESLint (typescript-eslint) + Prettier
- dotenv

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-username/discord-mcp-server.git
cd discord-mcp-server
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_application_client_id_here
GUILD_ID=your_guild_id_here
```

> **Where to get these values:**
> - Go to the [Discord Developer Portal](https://discord.com/developers/applications)
> - Create an application → add a Bot → copy the **Token** and **Application ID** (= Client ID)
> - Your **Guild ID**: right-click your server in Discord → "Copy Server ID" (requires Developer Mode)

### 4. Invite the bot to your server

In the Developer Portal, go to **OAuth2 → URL Generator**, select:

- **Scopes:** `bot`, `applications.commands`
- **Permissions:** `Send Messages`, `Read Message History`, `Manage Channels`, `Manage Roles`

Use the generated URL to invite the bot to your server.

---

## ▶️ Running

### Run as a standalone Discord Bot (with slash commands)

First, register the slash commands once:

```bash
npm run deploy-commands
```

Then start the bot:

```bash
npm run bot
```

### Run as an MCP Server (for AI integration)

```bash
npm run mcp
```

The MCP server communicates over **stdio**, making it compatible with any MCP client (e.g., Claude Desktop).

---

## 🔌 Connecting to Claude Desktop

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "discord": {
      "command": "npx",
      "args": ["ts-node", "/path/to/discord-mcp-server/mcp-server.ts"],
      "env": {
        "DISCORD_TOKEN": "your_discord_bot_token_here"
      }
    }
  }
}
```

Once connected, Claude will have access to all Discord tools listed above.

---

## 🛠 Development

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Format code
npm run format
```

---

## 📁 Project Structure

```
discord-mcp-server/
├── index.ts              # Standalone Discord bot (slash commands)
├── mcp-server.ts         # MCP server with all Discord tools
├── deploy-commands.ts    # One-time slash command registration script
├── .env.example          # Environment variable template
├── eslint.config.mjs     # ESLint configuration
├── .prettierrc           # Prettier configuration
├── tsconfig.json
└── package.json
```

---

## ⚠️ Security

- **Never commit your `.env` file.** It is already listed in `.gitignore`.
- Treat your `DISCORD_TOKEN` like a password — if exposed, reset it immediately in the Developer Portal.
- The `Manage Roles` permission allows the bot to assign roles **only below its own highest role** in the hierarchy. This is enforced by Discord automatically.

---

## 📄 License

ISC
