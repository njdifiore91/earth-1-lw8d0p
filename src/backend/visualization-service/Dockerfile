# Build stage
FROM node:18-alpine3.18 AS builder

# Set build environment variables
ENV NODE_ENV=production \
    UV_THREADPOOL_SIZE=8 \
    NPM_CONFIG_LOGLEVEL=warn

# Install build dependencies
RUN apk add --no-cache --virtual .build-deps \
    python3 \
    make \
    g++ \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with canvas support
RUN npm ci --canvas=cairo \
    && npm cache clean --force

# Copy source code and config
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript with visualization optimizations
RUN npm run build \
    && npm prune --production \
    # Optimize D3.js bundles
    && find dist -name "*.js" -exec gzip -k {} \;

# Runtime stage
FROM node:18-alpine3.18 AS runtime

# Set runtime environment variables
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=4096 --max-semi-space-size=512" \
    UV_THREADPOOL_SIZE=8 \
    PORT=3003

# Install runtime dependencies
RUN apk add --no-cache \
    cairo \
    pango \
    jpeg \
    giflib \
    librsvg \
    dumb-init \
    # Create non-root user
    && addgroup -S nodejs \
    && adduser -S -G nodejs nodejs \
    # Create directories for exports
    && mkdir -p /app/exports \
    && chown -R nodejs:nodejs /app

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --production --canvas=cairo \
    && npm cache clean --force

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist
COPY healthcheck.js ./

# Configure security headers
RUN echo "module.exports = {" > security-config.js \
    && echo "  contentSecurityPolicy: {" >> security-config.js \
    && echo "    directives: {" >> security-config.js \
    && echo "      defaultSrc: [\"'self'\"]," >> security-config.js \
    && echo "      scriptSrc: [\"'self'\", \"'unsafe-inline'\"]," >> security-config.js \
    && echo "      styleSrc: [\"'self'\", \"'unsafe-inline'\"]," >> security-config.js \
    && echo "      imgSrc: [\"'self'\", \"data:\", \"blob:\"]" >> security-config.js \
    && echo "    }" >> security-config.js \
    && echo "  }" >> security-config.js \
    && echo "}" >> security-config.js

# Set permissions
RUN chown -R nodejs:nodejs /app \
    && chmod -R 755 /app/exports \
    && chmod +x healthcheck.js

# Expose visualization service port
EXPOSE 3003

# Switch to non-root user
USER nodejs

# Configure health check
HEALTHCHECK --interval=30s \
            --timeout=10s \
            --retries=3 \
            CMD ["node", "healthcheck.js", "--check-visualization-system"]

# Use dumb-init as init system
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start visualization service with optimized settings
CMD ["node", "--max-old-space-size=4096", "--max-semi-space-size=512", "dist/index.js"]

# Add security and metadata labels
LABEL org.label-schema.schema-version="1.0" \
      org.label-schema.name="matter-visualization-service" \
      org.label-schema.description="Visualization service for Matter platform" \
      security.matter.compliance.level="high" \
      security.matter.node.version="18-lts" \
      security.matter.security.scanning="enabled" \
      security.matter.visualization.optimized="true"