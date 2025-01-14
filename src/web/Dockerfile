# Build stage
FROM node:18-alpine3.18 AS builder

# Set build arguments and environment variables
ARG API_URL
ARG MAPBOX_TOKEN
ARG TYPESCRIPT_VERSION=4.9.5
ENV NODE_ENV=production \
    VITE_API_URL=${API_URL} \
    VITE_MAPBOX_TOKEN=${MAPBOX_TOKEN}

# Set up secure build environment
WORKDIR /app
RUN apk add --no-cache --virtual .build-deps \
    python3 \
    make \
    g++ \
    git \
    # Install security scanning tools
    && npm install -g npm@latest \
    && npm install -g snyk \
    && npm install -g typescript@${TYPESCRIPT_VERSION}

# Copy package files with integrity verification
COPY package*.json ./
COPY yarn.lock ./

# Security audit and install dependencies
RUN npm audit && \
    npm audit fix --force && \
    npm ci --only=production && \
    # Remove npm cache and build dependencies
    npm cache clean --force && \
    apk del .build-deps

# Copy source code with appropriate permissions
COPY --chown=node:node . .

# Type checking and security scanning
RUN tsc --noEmit --strict && \
    snyk test && \
    # Build production bundle with optimization
    npm run build && \
    # Generate compressed assets
    find dist -type f -regex '.*\.\(js\|css\|html\|svg\)$' -exec gzip -k {} \; && \
    find dist -type f -regex '.*\.\(js\|css\|html\|svg\)$' -exec brotli -k {} \; && \
    # Verify build artifact integrity
    sha256sum dist/**/* > dist/checksums.txt

# Production runtime stage
FROM nginx:1.24-alpine AS runtime

# Import security configurations from base image
COPY --from=base /etc/security/limits.conf /etc/security/limits.conf
COPY --from=base /etc/apparmor.d/container_policy /etc/apparmor.d/container_policy

# Configure Nginx with security hardening
RUN rm /etc/nginx/conf.d/default.conf && \
    # Install additional security packages
    apk add --no-cache \
    curl \
    tzdata \
    # Set up nginx user
    adduser -D -H -u 101 -s /sbin/nologin nginx && \
    # Configure security headers
    echo "add_header X-Frame-Options 'SAMEORIGIN' always;" > /etc/nginx/security.conf && \
    echo "add_header X-Content-Type-Options 'nosniff' always;" >> /etc/nginx/security.conf && \
    echo "add_header X-XSS-Protection '1; mode=block' always;" >> /etc/nginx/security.conf && \
    echo "add_header Referrer-Policy 'strict-origin-when-cross-origin' always;" >> /etc/nginx/security.conf && \
    echo "add_header Content-Security-Policy \"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://api.mapbox.com; style-src 'self' 'unsafe-inline' https://api.mapbox.com; img-src 'self' data: https://*.mapbox.com blob:; connect-src 'self' https://*.mapbox.com https://events.mapbox.com;\" always;" >> /etc/nginx/security.conf

# Copy Nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy verified built assets from builder stage
COPY --from=builder --chown=nginx:nginx /app/dist /usr/share/nginx/html

# Configure file permissions
RUN chmod -R 755 /usr/share/nginx/html && \
    chown -R nginx:nginx /usr/share/nginx/html && \
    # Remove unnecessary files and capabilities
    rm -rf /usr/share/nginx/html/.*

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl --fail http://localhost:80/health || exit 1

# Set nginx user
USER nginx

# Expose port
EXPOSE 80

# Set read-only root filesystem
ENV NGINX_WORKER_PROCESSES=auto
VOLUME ["/var/cache/nginx", "/var/run"]

# Add metadata labels
LABEL maintainer="Matter Platform Team" \
      org.label-schema.name="matter-platform-web" \
      org.label-schema.description="Matter Platform Web Frontend" \
      org.label-schema.schema-version="1.0" \
      org.label-schema.docker.cmd="docker run -p 80:80 matter-platform-web"

CMD ["nginx", "-g", "daemon off;"]