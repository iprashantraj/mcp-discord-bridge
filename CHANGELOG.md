# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), and the
project adheres to [Semantic Versioning](https://semver.org/).

## [1.2.0] - 2026-05-29

### Added

- **MCP tool annotations** on all 44 tools (`title`, `readOnlyHint`,
  `destructiveHint`, `openWorldHint`) so clients can label and gate actions.
- **Read-only mode** via the `DISCORD_READONLY` env var. When set, only the 10
  read tools are advertised and callable; all write/destructive tools are refused.
- `CHANGELOG.md` and `SECURITY.md`.
- Tests for read-only gating and moderation limit clamping (59 tests total).

### Changed

- **Dockerfile** now compiles to `dist/` in a builder stage and runs
  `node dist/mcp-server.js` with production-only dependencies — no more shipping
  `ts-node`/TypeScript to the runtime image. This matches the npm entrypoint.
- `search_messages` description now states honestly that it scans only the 100
  most recent messages, and its output includes a `note` saying so.
- `asTextChannel` now also accepts announcement (News) channels.
- Aligned the tool-call wait with the 15s login timeout (was 8s).

### Fixed

- Corrected the advertised tool count (was "46", actually **44**).
- `ban` `delete_message_days` is clamped to 0–7; `timeout` duration is clamped to
  Discord's 28-day maximum instead of erroring.
- Replaced deprecated discord.js APIs in the standalone bot (`ready` →
  `clientReady`, `ephemeral` → `flags`, removed `fetchReply`).
- Added SIGINT/SIGTERM handlers that close the Discord connection cleanly.

## [1.1.0] - 2026-05-21

### Changed

- The MCP server no longer calls `process.exit()` on a missing/invalid token.
  Instead it starts, lists tools, and returns a clear error from each tool call
  (e.g. "DISCORD_TOKEN is not set …"), which MCP clients surface to the user.

### Removed

- `CONNECTING.md` — its instructions conflicted with the npx-first README, which
  is now the single source of truth.

## [1.0.0] - 2026-05-14

- Initial release: MCP server + standalone Discord bot.
