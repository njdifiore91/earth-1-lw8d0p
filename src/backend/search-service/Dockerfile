# Start from the Python base stage
FROM python:3.11-slim AS python-base

# Set build-time environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    POETRY_VERSION=1.4.0 \
    POETRY_HOME=/opt/poetry \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    POETRY_NO_INTERACTION=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONHASHSEED=random \
    GDAL_VERSION=3.6.2 \
    PROJ_VERSION=9.1.1 \
    GEOS_VERSION=3.11.1

# Install system dependencies and geospatial libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    gdal-bin=${GDAL_VERSION}* \
    libgdal-dev=${GDAL_VERSION}* \
    libgeos-dev=${GEOS_VERSION}* \
    libproj-dev=${PROJ_VERSION}* \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/* \
    # Install poetry
    && curl -sSL https://install.python-poetry.org | python3 - \
    && ln -s /opt/poetry/bin/poetry /usr/local/bin/poetry \
    # Configure spatial environment
    && ldconfig

# Builder stage for dependencies and compilation
FROM python-base AS python-builder

WORKDIR /app

# Copy dependency files
COPY pyproject.toml poetry.lock ./

# Install production dependencies
RUN poetry config virtualenvs.create false \
    && poetry install --no-dev --no-root --no-interaction \
    && poetry export -f requirements.txt --output requirements.txt \
    # Install geospatial packages
    && pip install --no-cache-dir \
        GDAL==${GDAL_VERSION} \
        pyproj==${PROJ_VERSION} \
        shapely==${GEOS_VERSION}

# Copy application source
COPY ./src ./src

# Build optimized bytecode
RUN python -m compileall ./src

# Final runtime stage
FROM python-base AS python-runtime

# Set runtime environment variables
ENV APP_PORT=8000 \
    APP_HOST=0.0.0.0 \
    MAX_WORKERS=4 \
    SEARCH_CACHE_SIZE=1024 \
    SPATIAL_INDEX_MEMORY=512m

# Create non-root user
RUN groupadd -r matter && useradd -r -g matter matter \
    && mkdir -p /app /app/data /app/cache \
    && chown -R matter:matter /app

WORKDIR /app

# Copy built artifacts from builder
COPY --from=python-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=python-builder /app/src ./src

# Configure spatial environment
ENV GDAL_DATA=/usr/share/gdal \
    PROJ_LIB=/usr/share/proj

# Set resource limits
RUN echo "matter soft nofile 65536" >> /etc/security/limits.conf \
    && echo "matter hard nofile 65536" >> /etc/security/limits.conf

# Configure health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c 'import http.client; conn = http.client.HTTPConnection("localhost:8000"); conn.request("GET", "/health"); response = conn.getresponse(); exit(0 if response.status == 200 else 1)'

# Expose application port
EXPOSE 8000

# Switch to non-root user
USER matter

# Set entrypoint and default command
ENTRYPOINT ["python"]
CMD ["-m", "uvicorn", "src.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]

# Add metadata labels
LABEL org.opencontainers.image.title="matter-search-service" \
      org.opencontainers.image.description="Matter platform search service with geospatial capabilities" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.vendor="Matter" \
      org.opencontainers.image.licenses="Proprietary" \
      security.matter.compliance.level="high" \
      security.matter.hardening.status="enabled" \
      security.matter.spatial.optimization="enabled"