# Matter Search Service

High-performance microservice for satellite data search operations and spatial processing, part of the Matter satellite data product matching platform.

## Overview

The search service provides core functionality for:
- Satellite data search request management
- Spatial data processing and validation
- Location-based search optimization
- Integration with EARTH-n simulator
- Caching and performance optimization

### Key Features
- Advanced spatial search capabilities
- Real-time geometry validation
- Comprehensive caching strategy
- Rate limiting and security controls
- Monitoring and observability

## Prerequisites

- Python 3.11+
- PostgreSQL 14+ with PostGIS extension
- Redis 7+
- Poetry 1.4+
- Docker 20.10+ (for containerization)
- kubectl (for Kubernetes deployment)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd search-service
```

2. Install dependencies using Poetry:
```bash
poetry install --no-root
```

3. Configure environment variables:
```bash
# Database Configuration
DATABASE_URL=postgresql://user:pass@host:5432/db
DB_HOST=localhost
DB_PORT=5432
DB_NAME=matter_search
DB_USER=matter_user
DB_PASSWORD=your_password
DB_SSL_MODE=verify-full
DB_SSL_CERT=/etc/ssl/certs/postgresql.crt

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=your_redis_password
REDIS_TLS=false

# API Configuration
DEBUG=false
PORT=8000
LOG_LEVEL=INFO
ALLOWED_ORIGINS=http://localhost:3000
ALLOWED_HOSTS=*
```

4. Initialize database:
```bash
# Create PostGIS extension
psql -d matter_search -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# Run migrations (when implemented)
poetry run alembic upgrade head
```

5. Start the service:
```bash
poetry run start
```

## Development

### Project Structure
```
src/
├── app.py                 # FastAPI application entry point
├── config/               # Configuration modules
│   ├── database.py      # PostgreSQL/PostGIS configuration
│   └── redis_config.py  # Redis cache configuration
├── controllers/         # API route handlers
│   ├── search_controller.py
│   └── location_controller.py
├── models/             # Database models
│   ├── search.py
│   └── location.py
├── schemas/            # Pydantic schemas
│   ├── search_schema.py
│   └── location_schema.py
└── utils/             # Utility functions
    └── spatial_utils.py
```

### Development Commands

```bash
# Start development server with hot reload
poetry run start

# Run tests with coverage
poetry run test

# Format code
poetry run format

# Run linting
poetry run lint

# Type checking
poetry run typecheck
```

### API Documentation

Once running, API documentation is available at:
- Swagger UI: http://localhost:8000/api/docs
- ReDoc: http://localhost:8000/api/redoc
- OpenAPI JSON: http://localhost:8000/api/openapi.json

#### Core Endpoints

- `POST /api/v1/searches` - Create new search
- `GET /api/v1/searches/{search_id}` - Retrieve search details
- `GET /api/v1/searches` - List searches
- `PATCH /api/v1/searches/{search_id}` - Update search
- `DELETE /api/v1/searches/{search_id}` - Delete search
- `POST /api/v1/searches/{search_id}/locations` - Add location to search

## Configuration

### Database Settings

- `POOL_SIZE`: Connection pool size (default: 20)
- `POOL_MAX_OVERFLOW`: Maximum pool overflow (default: 10)
- `POOL_TIMEOUT`: Connection timeout in seconds (default: 30)
- `POOL_RECYCLE`: Connection recycle time in seconds (default: 1800)
- `POOL_PRE_PING`: Enable connection pre-ping (default: true)

### Redis Settings

- `REDIS_MAX_CONNECTIONS`: Maximum connections (default: 100)
- `REDIS_TIMEOUT`: Connection timeout in seconds (default: 5.0)
- `REDIS_RETRY_INTERVAL`: Retry interval in seconds (default: 1.0)
- `REDIS_MAX_RETRIES`: Maximum retry attempts (default: 3)

### Security Settings

- `CORS_ORIGINS`: Allowed CORS origins
- `MAX_REQUESTS_PER_WINDOW`: Rate limit requests per window
- `RATE_LIMIT_WINDOW`: Rate limit window in seconds
- `MAX_CONCURRENT_SEARCHES`: Maximum concurrent searches per user

## Testing

```bash
# Run all tests
poetry run pytest

# Run with coverage report
poetry run pytest --cov=src --cov-report=term-missing

# Run specific test file
poetry run pytest tests/test_search_service.py
```

## Deployment

### Docker

```bash
# Build image
docker build -t matter/search-service:latest .

# Run container
docker run -p 8000:8000 \
  --env-file .env \
  matter/search-service:latest
```

### Kubernetes

```bash
# Apply deployment
kubectl apply -f k8s/deployment.yaml

# Apply service
kubectl apply -f k8s/service.yaml

# Apply config map
kubectl apply -f k8s/configmap.yaml

# Apply secrets
kubectl apply -f k8s/secrets.yaml
```

## Monitoring

The service exposes the following monitoring endpoints:

- `/health` - Service health check
- `/metrics` - Prometheus metrics

### Key Metrics

- `search_requests_total` - Total search requests
- `search_errors_total` - Total search errors
- `search_duration_seconds` - Search request duration
- `location_requests_total` - Total location requests
- `location_processing_seconds` - Location processing time

## Contributing

1. Create feature branch from `main`
2. Implement changes with tests
3. Run formatting and linting
4. Submit pull request with:
   - Clear description
   - Test coverage
   - Documentation updates

### Code Style

- Follow PEP 8 guidelines
- Use type hints
- Document public interfaces
- Maintain test coverage > 90%

## License

Copyright © 2023 Matter