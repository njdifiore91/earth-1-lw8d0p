# Enable BuildKit for enhanced security and build optimization
# syntax=docker/dockerfile:1.4

# Import base security configurations
FROM base AS base-security

# Node.js Dependencies Stage
FROM node:18-alpine3.18 AS node-deps
WORKDIR /app

# Set build environment variables
ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn \
    NPM_CONFIG_AUDIT=true

# Copy package files for Node.js services
COPY auth-service/package*.json auth-service/
COPY visualization-service/package*.json visualization-service/

# Install dependencies with security checks
RUN apk add --no-cache python3 make g++ \
    && cd auth-service \
    && npm ci --only=production \
    && npm audit \
    && cd ../visualization-service \
    && npm ci --only=production \
    && npm audit \
    && apk del python3 make g++

# Python Dependencies Stage
FROM python:3.11-slim AS python-deps
WORKDIR /app

# Set Python build environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    POETRY_VERSION=1.5.0 \
    POETRY_HOME=/opt/poetry \
    POETRY_VIRTUALENVS_IN_PROJECT=true

# Install poetry and dependencies
RUN pip install --no-cache-dir poetry==${POETRY_VERSION}

# Copy Python service configurations
COPY search-service/pyproject.toml search-service/poetry.lock search-service/
COPY planning-service/pyproject.toml planning-service/poetry.lock planning-service/

# Install dependencies for Python services
RUN cd search-service \
    && poetry install --no-dev --no-root \
    && cd ../planning-service \
    && poetry install --no-dev --no-root

# Final Production Stage
FROM alpine:3.18 AS final
WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production \
    PYTHON_VERSION=3.11 \
    TZ=UTC

# Install runtime dependencies
RUN apk add --no-cache \
    nodejs~=18 \
    npm \
    python3~=3.11 \
    libpq \
    tzdata \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -S matter && adduser -S matter -G matter

# Copy Node.js services
COPY --from=node-deps /app/auth-service /app/auth-service
COPY --from=node-deps /app/visualization-service /app/visualization-service

# Copy Python services
COPY --from=python-deps /app/search-service /app/search-service
COPY --from=python-deps /app/planning-service /app/planning-service

# Copy service source code
COPY auth-service/src /app/auth-service/src
COPY visualization-service/src /app/visualization-service/src
COPY search-service/src /app/search-service/src
COPY planning-service/src /app/planning-service/src

# Setup health check script
COPY --chmod=755 <<EOF /healthcheck.sh
#!/bin/sh
# Check Node.js services
curl -f http://localhost:3000/health || exit 1
curl -f http://localhost:3001/health || exit 1
# Check Python services
curl -f http://localhost:8000/health || exit 1
curl -f http://localhost:8001/health || exit 1
EOF

# Configure health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD ["/healthcheck.sh"]

# Set permissions
RUN chown -R matter:matter /app \
    && chmod -R 755 /app

# Configure security options
RUN echo "* hard nproc 1024" >> /etc/security/limits.conf \
    && echo "* hard nofile 1024" >> /etc/security/limits.conf

# Expose service ports
EXPOSE 3000 3001 8000 8001

# Switch to non-root user
USER matter

# Use dumb-init as init system
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start services using process manager
CMD ["sh", "-c", "cd auth-service && npm start & cd ../visualization-service && npm start & cd ../search-service && python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 & cd ../planning-service && python3 -m uvicorn main:app --host 0.0.0.0 --port 8001"]

# Add metadata labels
LABEL org.opencontainers.image.title="matter-backend-services" \
      org.opencontainers.image.description="Matter platform backend services" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.vendor="Matter" \
      org.opencontainers.image.licenses="Proprietary" \
      security.matter.compliance.level="high" \
      security.matter.hardening.status="enabled" \
      security.matter.runtime.protection="enabled"