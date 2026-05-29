# ───── Builder: install all deps and compile TypeScript → dist/ ─────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first for better layer caching
COPY package*.json tsconfig.json ./
RUN npm ci

# Compile
COPY *.ts ./
RUN npm run build

# ───── Production: ship only compiled JS + production deps ─────
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# No ports exposed: MCP uses stdio, the bot uses outbound WebSockets only.

# Default: the MCP server (stdio) — matches the npm package entrypoint and lets
# directory validators (Glama, Smithery) introspect tools.
# To run the standalone bot instead, override the command:
#   docker run ... node dist/index.js
CMD ["node", "dist/mcp-server.js"]
