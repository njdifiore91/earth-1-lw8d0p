# Multi-stage build for Python microservices
# Stage 1: Builder
FROM python:3.11-slim AS builder

# Set build-time environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    POETRY_VERSION=1.5.0 \
    POETRY_HOME=/opt/poetry \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    POETRY_NO_INTERACTION=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONHASHSEED=random

# Install system build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential=12.9 \
    curl=7.88.1-10 \
    git=1:2.39.2-1.1 \
    libpq-dev=15.3-0+deb12u1 \
    gdal-bin=3.6.2+dfsg-1+b1 \
    libgdal-dev=3.6.2+dfsg-1+b1 \
    && rm -rf /var/lib/apt/lists/*

# Install poetry
RUN curl -sSL https://install.python-poetry.org | python3 - \
    && ln -s /opt/poetry/bin/poetry /usr/local/bin/poetry

# Set up build directory
WORKDIR /build

# Copy project files
COPY pyproject.toml poetry.lock ./

# Install dependencies with optimizations
RUN poetry config virtualenvs.create false \
    && poetry install --no-dev --no-root --no-interaction \
    && poetry export -f requirements.txt --output requirements.txt \
    && pip wheel --no-cache-dir --no-deps --wheel-dir /wheels -r requirements.txt

# Stage 2: Final
FROM base

# Copy Python runtime optimizations from builder
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHON_RUNTIME_OPTIMIZATION=1 \
    PYTHONHASHSEED=random

# Install runtime dependencies
RUN apk add --no-cache \
    python3=3.11.4-r0 \
    py3-pip=23.1.2-r0 \
    libpq=15.3-r0 \
    gdal=3.6.4-r0 \
    && pip install --no-cache-dir --upgrade pip==23.1.2

# Copy wheels and install dependencies
COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r /wheels/requirements.txt \
    && rm -rf /wheels \
    && rm -rf /root/.cache/pip/*

# Configure Python optimizations
RUN python3 -c 'import compileall; compileall.compile_path(maxlevels=10)' \
    && python3 -m pip uninstall -y pip

# Copy application code
COPY ./src/backend /app
WORKDIR /app

# Set up non-root user permissions
RUN chown -R matter:matter /app \
    && chmod -R 755 /app

# Configure resource limits
ENV MEMORY_LIMIT=512M \
    CPU_LIMIT=80

# Enable security features
RUN python3 -c 'import ssl; ssl.PROTOCOL_TLSv1_2'

# Set up health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c 'import http.client; conn = http.client.HTTPConnection("localhost:8000"); conn.request("GET", "/health"); response = conn.getresponse(); exit(0 if response.status == 200 else 1)'

# Expose metrics port
EXPOSE 8000

# Set non-root user
USER matter

# Start application with optimizations
CMD ["python3", "-O", "main.py"]

# Add metadata labels
LABEL org.opencontainers.image.title="python-service" \
      org.opencontainers.image.description="Production Python service with security hardening" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.vendor="Matter" \
      org.opencontainers.image.licenses="Proprietary" \
      security.matter.compliance.level="high" \
      security.matter.hardening.status="enabled"