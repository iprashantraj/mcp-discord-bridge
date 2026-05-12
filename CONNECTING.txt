================================================================
  DISCORD MCP SERVER — HOW TO CONNECT TO ANY MCP CLIENT
================================================================

This MCP server works with ANY app that supports the Model Context
Protocol (MCP). Once connected, the app can control your Discord
server using the tools built into this project.

----------------------------------------------------------------
BEFORE YOU START — DO THIS ONCE
----------------------------------------------------------------

1. Clone or download this project to your machine.

2. Open a terminal in the project folder and run:
     npm install

3. Copy the environment file and fill in your values:
     cp .env.example .env

   Open .env and set:
     DISCORD_TOKEN   → Your bot token from Discord Developer Portal
     CLIENT_ID       → Your bot's Application ID (same portal)
     GUILD_ID        → Your Discord server ID (right-click server > Copy Server ID)

4. Invite the bot to your Discord server:
   - Go to: https://discord.com/developers/applications
   - Select your app > OAuth2 > URL Generator
   - Scopes: bot, applications.commands
   - Permissions: Send Messages, Read Message History, Manage Channels, Manage Roles
   - Open the generated URL in your browser and add the bot to your server.

5. Note down the FULL path to this project folder. You will need
   it in every client config below.
   Example (Windows): C:\Users\You\Projects\DiscordBot
   Example (Mac/Linux): /home/you/projects/DiscordBot


================================================================
CONNECTING TO SUPPORTED APPS
================================================================

----------------------------------------------------------------
1. CLAUDE DESKTOP
----------------------------------------------------------------
Config file location:
  Windows : %APPDATA%\Claude\claude_desktop_config.json
  macOS   : ~/Library/Application Support/Claude/claude_desktop_config.json

Add this inside the JSON (create the file if it doesn't exist):

  {
    "mcpServers": {
      "discord": {
        "command": "npx",
        "args": ["ts-node", "C:\\Users\\You\\Projects\\DiscordBot\\mcp-server.ts"],
        "env": {
          "DISCORD_TOKEN": "your_discord_bot_token_here"
        }
      }
    }
  }

Replace the path with your actual project path.
Use double backslashes (\\) on Windows.
Restart Claude Desktop. You should see the Discord tools available.

----------------------------------------------------------------
2. CURSOR (AI Code Editor)
----------------------------------------------------------------
  - Open Cursor
  - Go to: Settings (Ctrl+,) > search "MCP"
  - Click "Edit MCP Settings" or open .cursor/mcp.json manually
  - Add:

  {
    "mcpServers": {
      "discord": {
        "command": "npx",
        "args": ["ts-node", "/full/path/to/DiscordBot/mcp-server.ts"],
        "env": {
          "DISCORD_TOKEN": "your_discord_bot_token_here"
        }
      }
    }
  }

  Restart Cursor. The tools appear in the AI chat context.

----------------------------------------------------------------
3. WINDSURF (by Codeium)
----------------------------------------------------------------
  - Open Windsurf
  - Go to: Settings > MCP Servers > Add New Server
  - Fill in:
      Name    : discord
      Command : npx
      Args    : ts-node /full/path/to/DiscordBot/mcp-server.ts
      Env     : DISCORD_TOKEN=your_token_here

  Or edit the config file directly at:
    ~/.codeium/windsurf/mcp_settings.json

  And add the same JSON block as shown for Cursor above.

----------------------------------------------------------------
4. CONTINUE.DEV (VS Code / JetBrains plugin)
----------------------------------------------------------------
  Config file: ~/.continue/config.json

  Add inside the "mcpServers" array:

  {
    "mcpServers": [
      {
        "name": "discord",
        "command": "npx",
        "args": ["ts-node", "/full/path/to/DiscordBot/mcp-server.ts"],
        "env": {
          "DISCORD_TOKEN": "your_discord_bot_token_here"
        }
      }
    ]
  }

  Reload the Continue extension. The Discord tools will be available
  in the chat sidebar.

----------------------------------------------------------------
5. ZED EDITOR
----------------------------------------------------------------
  Config file: ~/.config/zed/settings.json

  Add this block:

  {
    "context_servers": {
      "discord-mcp": {
        "command": {
          "path": "npx",
          "args": ["ts-node", "/full/path/to/DiscordBot/mcp-server.ts"],
          "env": {
            "DISCORD_TOKEN": "your_discord_bot_token_here"
          }
        }
      }
    }
  }

  Restart Zed. Tools appear in the Assistant panel.

----------------------------------------------------------------
6. ANY CUSTOM APP (using the MCP SDK)
----------------------------------------------------------------
  You can connect any app programmatically using the official MCP SDK.
  Install it:
    npm install @modelcontextprotocol/sdk       (TypeScript/JS)
    pip install mcp                              (Python)

  Then spin up the server as a child process over stdio:

  // TypeScript example
  import { spawn } from 'child_process';
  const proc = spawn('npx', ['ts-node', '/path/to/mcp-server.ts'], {
    env: { ...process.env, DISCORD_TOKEN: 'your_token' },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  // Connect your MCP client transport to proc.stdin / proc.stdout


================================================================
WHAT TOOLS ARE AVAILABLE ONCE CONNECTED
================================================================

After connecting, the AI/app can call these tools:

  SERVER
    list_guilds          - List all Discord servers the bot is in

  CHANNELS
    list_channels        - List all channels and categories in a server
    create_category      - Create a new category
    create_channel       - Create a text or voice channel
    delete_channel       - Delete a channel or category
    move_channel         - Move a channel into a different category
    rename_channel       - Rename a channel or category

  MESSAGES
    get_channel_messages - Fetch recent messages from a text channel
    send_message         - Send a message to a channel

  MEMBERS
    list_members         - List members in a server (with roles)
    get_member           - Get detailed info about a specific member

  ROLES
    list_roles           - List all roles in a server
    assign_role          - Assign a role to a member
    remove_role          - Remove a role from a member


================================================================
TROUBLESHOOTING
================================================================

Bot not responding / tools not working?
  → Check that DISCORD_TOKEN in your .env (or client env config) is correct.
  → Make sure the bot has been invited to your server with the right permissions.
  → Run the server manually to see errors:
      npm run mcp

"Module not found" error?
  → Run:  npm install
  → Make sure the path in your client config points to the right folder.

Tools not showing up in the AI client?
  → Restart the app completely (not just reload).
  → Some apps cache MCP tool lists on startup.

Slash commands (/ping etc.) not working in Discord?
  → Run:  npm run deploy-commands
  → Wait up to 1 hour for global registration (guild commands are instant).

================================================================
