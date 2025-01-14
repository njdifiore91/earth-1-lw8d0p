# Matter Planning Service

Enterprise-grade satellite data collection planning and optimization service that integrates with the EARTH-n simulator for precise collection scheduling and capability assessment.

## Overview

The Planning Service is a core component of the Matter satellite data product matching platform, responsible for:

- Asset definition and validation
- Collection requirement processing
- Integration with EARTH-n simulator
- Collection window optimization
- Confidence scoring and validation

## Features

### Asset Management
- Comprehensive asset type validation
- Detection limit and size constraints
- Spectral and temporal requirements
- Capability assessment and scoring

### Collection Planning
- Time window optimization
- Multi-parameter requirement validation
- Confidence score calculation
- Collision avoidance checks

### EARTH-n Integration
- Real-time simulation queries
- Collection feasibility assessment
- Parameter optimization
- Results validation

### Results Processing
- Collection window generation
- Confidence score aggregation
- Timeline visualization data
- Export capabilities

## Installation

### Prerequisites
- Python 3.11+
- Poetry 1.5.0+
- Redis 7.0+
- EARTH-n Simulator API access

### Setup

1. Install dependencies:
```bash
poetry install
```

2. Configure environment variables:
```bash
# Core Settings
PLANNING_SERVICE_PORT=8000
PLANNING_SERVICE_HOST="0.0.0.0"
LOG_LEVEL="INFO"

# EARTH-n Integration
EARTHN_API_URL="https://earthn-simulator.matter.com/api/v1"
EARTHN_API_KEY="your-api-key"

# Redis Configuration
REDIS_HOST="localhost"
REDIS_PORT=6379
REDIS_DB=0

# Security
JWT_SECRET_KEY="your-secret-key"
JWT_ALGORITHM="RS256"
```

3. Start development server:
```bash
poetry run start
```

## API Documentation

### Authentication
All endpoints require JWT authentication using Bearer tokens:
```
Authorization: Bearer <jwt_token>
```

### Endpoints

#### Asset Definition
```
POST /api/v1/planning/assets
Content-Type: application/json

{
  "name": "Environmental Sensor",
  "type": "ENVIRONMENTAL_MONITORING",
  "min_size": 1.0,
  "detection_limit": 0.5,
  "properties": {
    "resolution": 0.3,
    "spectral_bands": ["RGB", "NIR"],
    "revisit_time": 3
  }
}
```

#### Collection Planning
```
POST /api/v1/planning/plans
Content-Type: application/json

{
  "search_id": "uuid",
  "asset_id": "uuid",
  "start_time": "2024-01-01T00:00:00Z",
  "end_time": "2024-01-07T00:00:00Z",
  "requirements": [
    {
      "parameter": "TEMPORAL",
      "value": 24,
      "unit": "hours"
    }
  ]
}
```

#### Plan Optimization
```
POST /api/v1/planning/plans/{planId}/optimize
```

## Development

### Code Quality

1. Format code:
```bash
poetry run format
```

2. Run type checking:
```bash
poetry run type-check
```

3. Run linting:
```bash
poetry run lint
```

### Testing

1. Run test suite:
```bash
poetry run test
```

2. Run with coverage:
```bash
poetry run pytest --cov=src tests/
```

3. Run load tests:
```bash
poetry run locust -f tests/locustfile.py
```

## Security

### API Security
- JWT-based authentication
- Role-based access control
- Rate limiting per client
- Input validation and sanitization

### Data Security
- TLS 1.3 encryption in transit
- Parameter validation
- SQL injection prevention
- XSS protection

## Monitoring

### Metrics
- Request latency
- Error rates
- EARTH-n simulator response times
- Collection window optimization metrics

### Logging
- Structured JSON logging
- Error tracking
- Audit logging
- Performance monitoring

### Health Checks
```
GET /health
GET /metrics
```

## Dependencies

### Core Dependencies
- fastapi ^0.95.0
- uvicorn ^0.21.0
- pydantic ^1.10.0
- numpy ^1.24.0
- redis ^4.5.0
- prometheus-client ^0.16.0

### Development Dependencies
- pytest ^7.3.0
- black ^23.3.0
- mypy ^1.3.0
- flake8 ^6.0.0
- bandit ^1.7.0

## License

Proprietary - Matter © 2024