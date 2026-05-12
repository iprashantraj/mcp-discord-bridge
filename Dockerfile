# Use the official Node.js 20 lightweight Alpine image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including devDependencies needed for build)
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build the TypeScript code (if we had a build step, we would run it here)
# Since we are using ts-node, we just prepare the environment
RUN npx tsc --noEmit

# ==========================================
# Production stage
# ==========================================
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies
RUN npm ci --omit=dev

# Copy source files from builder
COPY --from=builder /app/index.ts ./
COPY --from=builder /app/mcp-server.ts ./
COPY --from=builder /app/deploy-commands.ts ./
COPY --from=builder /app/tsconfig.json ./

# Expose no ports since MCP uses stdio and the bot uses WebSockets outbound

# Default command: run the standalone bot
CMD ["npm", "run", "bot"]
