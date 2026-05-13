# Discord MCP Server

Control your Discord server using AI. Works with **any MCP-compatible app** — Claude Desktop, Cursor, Windsurf, Continue.dev, Zed, Claude Code, and more.

> **What is MCP?** Model Context Protocol is an open standard that lets AI apps talk to external tools. This project is one of those tools — it gives any AI assistant the power to manage your Discord server.

<p align="center">
  <img src="./assets/demo.svg" alt="Demo showing Discord MCP tools in action" width="820">
</p>

---

## What Can It Do?

Once connected, your AI assistant can:

- **Channels** — create, delete, rename, move channels and categories
- **Messages** — read and send messages in any text channel
- **Members** — list members, view profiles, check roles
- **Roles** — list, assign, and remove roles
- **Server** — list all servers the bot is in, view channel layouts

It also runs as a **standalone Discord bot** with `/ping`, `/info`, and `/serverinfo` slash commands.

---

## Quick Start (5 minutes)

### Step 1: Create a Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** — give it a name
3. Go to **Bot** tab — click **Reset Token** — copy and save the token somewhere safe
4. Also copy the **Application ID** from the General Information tab

### Step 2: Invite the Bot to Your Server

1. In the Developer Portal, go to **OAuth2 > URL Generator**
2. Check these scopes: `bot`, `applications.commands`
3. Check these permissions: `Send Messages`, `Read Message History`, `Manage Channels`, `Manage Roles`
4. Open the generated URL — select your server — authorize

### Step 3: Set Up the Project

```bash
git clone https://github.com/iprashantraj/mcp-discord-bridge.git
cd mcp-discord-bridge
npm install
cp .env.example .env
```

Open `.env` and fill in:

```env
DISCORD_TOKEN=paste_your_bot_token_here
CLIENT_ID=paste_your_application_id_here
GUILD_ID=paste_your_server_id_here
```

> **How to get your Guild ID:** Open Discord > right-click your server name > **Copy Server ID**
> (If you don't see this option, enable Developer Mode in Settings > Advanced)

### Step 4: Connect to Your AI App

Add this to your app's MCP config (replace the path with where you cloned the project):

```json
{
  "mcpServers": {
    "discord": {
      "command": "npx",
      "args": ["ts-node", "/full/path/to/mcp-discord-bridge/mcp-server.ts"],
      "env": {
        "DISCORD_TOKEN": "paste_your_bot_token_here"
      }
    }
  }
}
```

**Where is the config file?**

| App | Config Location |
|-----|----------------|
| **Claude Desktop** | Windows: `%APPDATA%\Claude\claude_desktop_config.json` · macOS: `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Claude Code** | `~/.claude.json` (or run `/mcp` in Claude Code) |
| **Cursor** | Settings > search "MCP" > Edit MCP Settings |
| **Windsurf** | `~/.codeium/windsurf/mcp_settings.json` |
| **Continue.dev** | `~/.continue/config.json` |
| **Zed** | `~/.config/zed/settings.json` |

> For detailed per-app instructions, see [CONNECTING.md](./CONNECTING.md).

### Step 5: Done!

Restart your AI app. You should now see Discord tools available. Try asking:

> *"List all channels in my Discord server"*

---

## All Available Tools

| Tool | What It Does |
|------|-------------|
| `list_guilds` | List all servers the bot is in |
| `list_channels` | List all channels and categories |
| `create_category` | Create a new category |
| `create_channel` | Create a text or voice channel |
| `delete_channel` | Delete a channel or category |
| `move_channel` | Move a channel to a different category |
| `rename_channel` | Rename a channel or category |
| `get_channel_messages` | Fetch recent messages (up to 100) |
| `send_message` | Send a message to a channel |
| `list_members` | List server members with roles |
| `get_member` | Get detailed info about a member |
| `list_roles` | List all roles in a server |
| `assign_role` | Give a role to a member |
| `remove_role` | Take a role from a member |

---

## Running as a Standalone Bot

If you just want the slash commands without MCP:

```bash
# Register commands (one time)
npm run deploy-commands

# Start the bot
npm run bot
```

| Command | Description |
|---------|-------------|
| `/ping` | Check bot latency |
| `/info` | Show bot uptime and stats |
| `/serverinfo` | Show server details |

---

## Docker Deployment

Run the bot 24/7 on a server or Raspberry Pi:

```bash
docker-compose up -d       # Start in background
docker-compose logs -f     # View logs
```

---

## Development

```bash
npm run typecheck    # Type check
npm run lint         # Lint
npm run test         # Run tests (26 tests)
npm run format       # Format code
```

CI runs automatically on every push and PR via GitHub Actions.

### Project Structure

```
mcp-discord-bridge/
├── discord-client.ts     # Shared Discord client setup
├── mcp-server.ts         # MCP server (tool schemas + wiring)
├── mcp-handlers.ts       # Tool handler logic (registry pattern)
├── index.ts              # Standalone bot (slash commands)
├── deploy-commands.ts    # One-time command registration
├── tests/                # Vitest test suite
├── .github/workflows/    # CI pipeline
├── Dockerfile            # Multi-stage Docker build
└── CONNECTING.md         # Detailed per-app setup guide
```

---

## Security

- **Never commit your `.env` file** — it's already in `.gitignore`
- Treat your `DISCORD_TOKEN` like a password — if leaked, regenerate it immediately in the Developer Portal
- The bot can only assign roles **below its own role** in the hierarchy (Discord enforces this)

---

## License

[MIT](./LICENSE) — use it however you want.
