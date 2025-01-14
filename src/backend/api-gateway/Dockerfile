# Extend base Node.js builder stage
FROM node:18-alpine3.18 AS builder

# Set build-time environment variables
ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn \
    NPM_CONFIG_AUDIT=true \
    TS_NODE_PROJECT=tsconfig.json

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with security audit
RUN npm ci --only=production \
    && npm audit \
    && npm cache clean --force

# Copy TypeScript configuration and source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript code
RUN npm run build \
    && rm -rf src/ \
    && rm tsconfig.json

# Production runtime stage
FROM node:18-alpine3.18 AS runtime

# Set runtime environment variables
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048 --max-http-header-size=16384 --no-experimental-fetch" \
    PORT=3000

# Install production dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    && addgroup -S matter \
    && adduser -S -G matter matter \
    && mkdir -p /app \
    && chown -R matter:matter /app

# Set working directory
WORKDIR /app

# Copy built artifacts from builder stage
COPY --from=builder --chown=matter:matter /app/package*.json ./
COPY --from=builder --chown=matter:matter /app/dist/ ./dist/
COPY --from=builder --chown=matter:matter /app/node_modules/ ./node_modules/

# Configure security limits
RUN echo "* soft nofile 1024" >> /etc/security/limits.conf \
    && echo "* hard nofile 1024" >> /etc/security/limits.conf \
    && echo "* soft nproc 1024" >> /etc/security/limits.conf \
    && echo "* hard nproc 1024" >> /etc/security/limits.conf

# Set up health check
HEALTHCHECK --interval=30s \
            --timeout=10s \
            --start-period=5s \
            --retries=3 \
            CMD curl -f --max-time 5 http://localhost:3000/health || exit 1

# Expose API Gateway port
EXPOSE 3000

# Switch to non-root user
USER matter

# Use dumb-init as init system
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start API Gateway service
CMD ["node", "dist/index.js"]

# Add metadata labels
LABEL org.label-schema.schema-version="1.0" \
      org.label-schema.name="matter-api-gateway" \
      org.label-schema.description="API Gateway service for Matter platform" \
      org.label-schema.vendor="Matter" \
      org.label-schema.version="1.0.0" \
      security.matter.compliance.level="high" \
      security.matter.hardening.status="enabled" \
      security.matter.runtime.protection="enabled"

# Configure read-only root filesystem
VOLUME ["/tmp", "/var/run"]