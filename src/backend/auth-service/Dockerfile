# Build stage
FROM node:18-alpine3.18 AS builder

# Set secure build-time environment variables
ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn \
    NPM_CONFIG_AUDIT=true \
    TS_NODE_PROJECT=tsconfig.json

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with security optimizations
RUN npm ci --production=false \
    --audit=true \
    --fund=false \
    --ignore-scripts \
    && npm cache clean --force

# Copy source code and config files
COPY . .

# Run security audit
RUN npm audit \
    && npm run lint \
    && npm run test

# Build application
RUN npm run build \
    && npm prune --production \
    && rm -rf src tests

# Runtime stage
FROM node:18-alpine3.18 AS runtime

# Set secure runtime environment variables
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048 --max-http-header-size=16384 --no-experimental-fetch" \
    NPM_CONFIG_LOGLEVEL=warn \
    AUTH_SERVICE_MEMORY_LIMIT=2048M \
    AUTH_SERVICE_HEAP_SIZE_LIMIT=1536M

# Install production dependencies
RUN apk add --no-cache \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -S nodejs && \
    adduser -S -G nodejs nodejs && \
    chown -R nodejs:nodejs /home/nodejs

# Set working directory
WORKDIR /app

# Copy production dependencies and compiled code
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY healthcheck.js ./

# Configure security policies
RUN echo "kernel.unprivileged_userns_clone=1" >> /etc/sysctl.conf && \
    echo "net.ipv4.ip_unprivileged_port_start=0" >> /etc/sysctl.conf

# Set up rate limiting configuration
COPY --from=builder /app/config/rate-limit.js ./config/
RUN chmod 444 ./config/rate-limit.js

# Set secure file permissions
RUN chown -R nodejs:nodejs /app && \
    chmod -R 444 /app && \
    chmod 555 /app/dist && \
    chmod 555 /app/node_modules

# Expose auth service port
EXPOSE 3000

# Switch to non-root user
USER nodejs

# Configure health check
HEALTHCHECK --interval=30s \
            --timeout=10s \
            --start-period=5s \
            --retries=3 \
            CMD ["node", "healthcheck.js"]

# Use dumb-init as init system
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start auth service
CMD ["node", "dist/index.js"]

# Add security and metadata labels
LABEL org.label-schema.schema-version="1.0" \
      org.label-schema.name="matter-auth-service" \
      org.label-schema.description="Matter Platform Authentication Service" \
      security.matter.compliance.level="high" \
      security.matter.node.version="18-lts" \
      security.matter.security.scanning="enabled" \
      security.matter.service.type="authentication"