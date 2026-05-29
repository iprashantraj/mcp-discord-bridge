# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead, open a
[GitHub security advisory](https://github.com/iprashantraj/mcp-discord-bridge/security/advisories/new)
or contact the maintainer privately. You'll get an acknowledgement within a few days.

## Threat model

This server gives an AI assistant control over a Discord server through a bot
token. Keep these properties in mind when deploying it.

### The bot token is a credential

- It is read only from the `DISCORD_TOKEN` environment variable, never from a file
  committed to the repo, and is never logged.
- Anyone with the token can act as the bot. Treat it like a password; rotate it in
  the Discord Developer Portal if it leaks.

### Grant least privilege

The bot can only do what its Discord permissions allow. Only grant what you use —
if you won't moderate, don't grant Ban/Kick/Manage Roles. Discord also prevents
the bot from acting on roles above its own in the hierarchy.

### Prompt-injection awareness

The AI can both **read** channel messages (`get_channel_messages`,
`search_messages`) and **act** on the server (delete, ban, role changes). Message
content is untrusted input: a malicious message could try to manipulate the AI into
taking a destructive action. Mitigations:

- **Read-only mode** — set `DISCORD_READONLY=true` to disable every write and
  destructive tool. Only `list_*`, `get_*`, and `search_messages` remain.
- **Tool annotations** — all tools expose `readOnlyHint`/`destructiveHint`, so
  MCP clients can require user confirmation before destructive calls.
- Run the bot in a server you control, with the minimum permissions needed.

## Supported versions

Only the latest published version on npm receives security fixes.
