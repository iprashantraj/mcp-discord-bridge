# Use the official Node.js 20 lightweight Alpine image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm ci

# Copy the rest of the source code
COPY . .

# Type-check the project
RUN npx tsc --noEmit

# ==========================================
# Production stage
# ==========================================
FROM node:20-alpine

WORKDIR /app

# Copy package files and install all deps (ts-node needed at runtime)
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Copy source files from builder
COPY --from=builder /app/index.ts ./
COPY --from=builder /app/mcp-server.ts ./
COPY --from=builder /app/deploy-commands.ts ./
COPY --from=builder /app/tsconfig.json ./

# Expose no ports since MCP uses stdio and the bot uses WebSockets outbound

# Default command: run the standalone bot
CMD ["npx", "ts-node", "index.ts"]
