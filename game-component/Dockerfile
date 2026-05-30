# ────────────────────────────────────────────────────────────
# Stage 1: Build / Install Dependencies
# ────────────────────────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --only=production --ignore-scripts

# Copy source code
COPY . .

# ────────────────────────────────────────────────────────────
# Stage 2: Production Runtime
# ────────────────────────────────────────────────────────────
FROM node:18-alpine AS production

RUN apk add --no-cache tini

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./
COPY --from=builder /app/sql ./sql

# Set proper ownership
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3001
EXPOSE 9090

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
