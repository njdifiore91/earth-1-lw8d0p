# Extend base security configurations
FROM alpine:3.18 AS base-node

# Import base security configurations
COPY --from=base.dockerfile . .

# Build stage for Node.js applications
FROM node:18-alpine3.18 AS node-builder

# Set build-time environment variables
ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn \
    NPM_CONFIG_AUDIT=true \
    TS_NODE_PROJECT=tsconfig.json \
    SECURITY_SCAN_LEVEL=high

# Install build essentials and security tools
RUN apk add --no-cache --virtual .build-deps \
    python3 \
    make \
    g++ \
    git \
    && npm install -g \
    typescript@4.9 \
    @typescript-eslint/parser \
    @typescript-eslint/eslint-plugin \
    snyk \
    npm-audit-resolver \
    license-checker \
    && npm cache clean --force

# Configure TypeScript compiler options
COPY tsconfig.json ./
RUN echo '{"compilerOptions":{"strict":true,"noImplicitAny":true,"strictNullChecks":true}}' > tsconfig.json

# Set up security scanning
RUN npm audit && \
    snyk test && \
    license-checker --production --failOn "GPL;LGPL"

# Runtime stage with security hardening
FROM node:18-alpine3.18 AS node-runtime

# Set runtime environment variables
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048 --max-http-header-size=16384 --no-experimental-fetch --heapsnapshot-signal=SIGUSR2" \
    NPM_CONFIG_LOGLEVEL=warn \
    V8_OPTIMIZED="--optimize-for-size --max-semi-space-size=64 --max-old-space-size=2048" \
    SECURITY_HEADERS="helmet,cors,rate-limit,content-security-policy"

# Install production dependencies and security packages
RUN apk add --no-cache \
    dumb-init \
    && npm install -g \
    pm2@latest \
    helmet \
    cors \
    rate-limiter-flexible \
    express-validator \
    && npm cache clean --force

# Configure security middleware
COPY --from=base-node /etc/security/limits.conf /etc/security/limits.conf
COPY --from=base-node /etc/apparmor.d/container_policy /etc/apparmor.d/container_policy

# Set up health check system
COPY healthcheck.js /usr/local/bin/
RUN chmod +x /usr/local/bin/healthcheck.js

HEALTHCHECK --interval=30s \
            --timeout=10s \
            --start-period=60s \
            --start-interval=5s \
            --retries=3 \
            CMD ["node", "/usr/local/bin/healthcheck.js"]

# Configure process manager with security features
COPY pm2.config.js ./
RUN echo '{"apps":[{"name":"node-app","script":"app.js","instances":"max","exec_mode":"cluster","max_memory_restart":"2G"}]}' > pm2.config.js

# Set up security headers and CSP
RUN echo "module.exports = {" > security-config.js && \
    echo "  contentSecurityPolicy: {" >> security-config.js && \
    echo "    directives: {" >> security-config.js && \
    echo "      defaultSrc: [\"'self'\"]," >> security-config.js && \
    echo "      scriptSrc: [\"'self'\"]," >> security-config.js && \
    echo "      styleSrc: [\"'self'\"]," >> security-config.js && \
    echo "      imgSrc: [\"'self'\"]" >> security-config.js && \
    echo "    }" >> security-config.js && \
    echo "  }" >> security-config.js && \
    echo "}" >> security-config.js

# Set up rate limiting
RUN echo "module.exports = {" > rate-limit.js && \
    echo "  windowMs: 15 * 60 * 1000," >> rate-limit.js && \
    echo "  max: 100" >> rate-limit.js && \
    echo "}" >> rate-limit.js

# Create non-root user
RUN addgroup -S nodejs && \
    adduser -S -G nodejs nodejs && \
    chown -R nodejs:nodejs /home/nodejs

# Set working directory
WORKDIR /home/nodejs/app

# Switch to non-root user
USER nodejs

# Use dumb-init as init system
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Default command to run application with PM2
CMD ["pm2-runtime", "start", "pm2.config.js"]

# Add security labels
LABEL org.label-schema.schema-version="1.0" \
      org.label-schema.name="matter-node-service" \
      org.label-schema.description="Secure Node.js runtime for Matter platform" \
      security.matter.compliance.level="high" \
      security.matter.node.version="18-lts" \
      security.matter.security.scanning="enabled"

# Export stages for child images
ONBUILD ARG NODE_SERVICE_NAME
ONBUILD LABEL service.matter.name=${NODE_SERVICE_NAME}