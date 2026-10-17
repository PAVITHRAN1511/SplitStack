# SplitStack Production Dockerfile (Review 3, Phase P15)
# Multi-stage lightweight production container based on Node.js 20 LTS Alpine.

FROM node:20-alpine AS base

# Install curl for healthcheck diagnostics if needed
RUN apk add --no-cache curl

WORKDIR /usr/src/app

# Set production environment defaults
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Copy root and server package manifests and lockfiles for reproducible installs
COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/

# Install only production dependencies in server/
RUN npm --prefix server ci --omit=dev && npm cache clean --force

# Copy application source code and client static assets
COPY server/ ./server/
COPY client/ ./client/

# Ensure directory permissions for non-root user 'node'
RUN mkdir -p /usr/src/app/server/uploads/temp && \
    chown -R node:node /usr/src/app

# Execute as non-root user for security hardening
USER node

# Expose standard application port
EXPOSE 3000

# Container healthcheck querying the standard Express health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the SplitStack Express + MongoDB backend
CMD ["node", "server/src/index.js"]
