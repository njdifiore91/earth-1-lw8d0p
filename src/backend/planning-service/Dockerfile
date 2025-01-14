# Extend from base Python builder stage
FROM python-builder AS planning-deps

# Set planning service specific build arguments
ARG PLANNING_SERVICE_VERSION=1.0.0
ARG BUILD_DATE
ARG VCS_REF

# Set environment variables for build optimization
ENV NUMPY_NUM_THREADS=4 \
    OPENBLAS_NUM_THREADS=4 \
    MKL_NUM_THREADS=4 \
    SCIPY_NUM_THREADS=4 \
    NUMEXPR_NUM_THREADS=4 \
    OMP_NUM_THREADS=4

# Copy dependency specifications
COPY pyproject.toml poetry.lock ./

# Install production dependencies with optimizations
RUN poetry install --no-dev --no-root --no-interaction \
    && poetry export -f requirements.txt --output requirements.txt \
    # Build optimized wheels for scientific packages
    && pip wheel --no-cache-dir --no-deps --wheel-dir /wheels \
        numpy==1.24.* \
        scipy==1.10.* \
        pandas==2.0.* \
        geopandas==0.13.* \
        shapely==2.0.* \
        pyproj==3.5.* \
        -r requirements.txt \
    # Verify dependencies for security
    && poetry run safety check \
    # Clean up build artifacts
    && rm -rf /root/.cache/pip/* \
    && rm -rf /root/.cache/poetry/*

# Final runtime stage
FROM python-runtime AS planning-runtime

# Set service-specific environment variables
ENV PYTHONPATH=/app \
    APP_PORT=8000 \
    APP_HOST=0.0.0.0 \
    PLANNING_SERVICE_NAME=matter-planning-service \
    PLANNING_MAX_WORKERS=4 \
    PLANNING_TIMEOUT=300 \
    NUMPY_NUM_THREADS=4

# Copy wheels and install dependencies
COPY --from=planning-deps /wheels /wheels
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r /wheels/requirements.txt \
    && rm -rf /wheels \
    && rm -rf /root/.cache/pip/*

# Create necessary directories with proper permissions
RUN mkdir -p /app/data /app/logs /app/cache \
    && chown -R matter:matter /app \
    && chmod -R 755 /app

# Copy application source code
COPY --chown=matter:matter ./src /app/src

# Set working directory
WORKDIR /app

# Configure resource limits
ENV MEMORY_LIMIT=2G \
    CPU_LIMIT=4

# Set up health check with custom planning service checks
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c 'import http.client; \
        conn = http.client.HTTPConnection("localhost:8000"); \
        conn.request("GET", "/health"); \
        response = conn.getresponse(); \
        exit(0 if response.status == 200 and \
            response.read().decode("utf-8").find("\"planning_queue\":\"healthy\"") != -1 \
            else 1)'

# Expose service port
EXPOSE 8000

# Switch to non-root user
USER matter

# Start planning service with optimized settings
CMD ["python", "-O", "-m", "uvicorn", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--timeout-keep-alive", "300", \
     "--log-level", "info", \
     "src.app:app"]

# Add metadata labels
LABEL org.opencontainers.image.title="matter-planning-service" \
      org.opencontainers.image.description="Satellite data collection planning and optimization service" \
      org.opencontainers.image.version="${PLANNING_SERVICE_VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.vendor="Matter" \
      org.opencontainers.image.licenses="Proprietary" \
      security.matter.compliance.level="high" \
      security.matter.hardening.status="enabled" \
      security.matter.runtime.protection="enabled"