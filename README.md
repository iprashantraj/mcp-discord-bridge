# 🤖 Discord MCP Server

A **Model Context Protocol (MCP) server** that gives AI assistants (like Claude) the ability to interact with and control Discord servers read messages, manage channels, send messages, and more.

Built with **TypeScript**, **discord.js v14**, and the **MCP SDK**.

---

## ✨ Features

The MCP server exposes the following tools to any MCP-compatible AI client:

| Tool | Description |
|---|---|
| `list_guilds` | List all Discord servers the bot is in |
| `list_channels` | List all channels and categories in a server |
| `create_category` | Create a new category |
| `create_channel` | Create a text or voice channel (optionally inside a category) |
| `delete_channel` | Delete a channel or category by ID |
| `move_channel` | Move a channel into a different category |
| `rename_channel` | Rename a channel or category |
| `get_channel_messages` | Fetch recent messages from a text channel |
| `send_message` | Send a message to a text channel |

---

## 🧰 Tech Stack

- [discord.js](https://discord.js.org/) v14
- [@modelcontextprotocol/sdk](https://modelcontextprotocol.io/)
- TypeScript + ts-node
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

Edit `.env` and fill in your Discord bot token:

```env
DISCORD_TOKEN=your_discord_bot_token_here
```

> **Where to get a token:** Go to the [Discord Developer Portal](https://discord.com/developers/applications), create an application, add a Bot, and copy the token.

### 4. Invite the bot to your server

In the Developer Portal, go to **OAuth2 → URL Generator**, select the following scopes and permissions:

- **Scopes:** `bot`
- **Permissions:** `Send Messages`, `Read Message History`, `Manage Channels`

Use the generated URL to invite the bot to your server.

---

## ▶️ Running

### Run as a standalone Discord Bot

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

## 📁 Project Structure

```
discord-mcp-server/
├── index.ts          # Standalone Discord bot entry point
├── mcp-server.ts     # MCP server with all Discord tools
├── .env.example      # Environment variable template
├── package.json
└── tsconfig.json
```

---

## ⚠️ Security

- **Never commit your `.env` file.** It is already listed in `.gitignore`.
- Treat your `DISCORD_TOKEN` like a password — if exposed, reset it immediately in the Developer Portal.

---

## 📄 License


