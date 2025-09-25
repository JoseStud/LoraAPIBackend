# Database Migrations in Docker Pipeline

This document explains how database migrations are integrated into the LoRA Manager Docker deployment pipeline.

## Migration Architecture

### Automatic Migration Strategy

The LoRA Manager Docker setup uses an automatic migration approach where:

1. **API Service** runs migrations automatically on startup
2. **Dedicated Migration Service** available for manual control
3. **Health Check Dependencies** ensure proper startup order
4. **Infrastructure Alembic Config** manages production migrations

### Migration Flow

```
PostgreSQL Startup → Health Check → Migrations → API Server → Worker
```

## Configuration Files

### 1. Startup Script (`start-api.sh`)
Automatically runs migrations before starting the API:

```bash
#!/bin/bash
# Wait for database → Run alembic upgrade head → Start API
```

### 2. Migration Script (`migrate.sh`)
Standalone migration runner:

```bash
#!/bin/bash
# Wait for database → Run alembic upgrade head only
```

### 3. Docker Compose Configuration
Updated service dependencies with health checks:

```yaml
api:
  depends_on:
    postgres:
      condition: service_healthy  # Wait for DB health check
  healthcheck:
    start_period: 60s  # Allow time for migrations
```

## Usage

### Automatic Migrations (Recommended)

```bash
# Start all services - migrations run automatically in API service
docker-compose up

# API service will:
# 1. Wait for PostgreSQL health check
# 2. Run migrations using infrastructure/alembic/
# 3. Start the API server
```

### Manual Migration Control

```bash
# Run migrations only using dedicated service
docker-compose --profile migration run migrate

# Check migration status
docker-compose exec api sh -c "cd infrastructure && alembic current"

# View migration history  
docker-compose exec api sh -c "cd infrastructure && alembic history"

# Run specific migration
docker-compose exec api sh -c "cd infrastructure && alembic upgrade <revision>"
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Deploy with Migrations
  run: |
    docker-compose --profile migration run migrate
    docker-compose up -d api worker
```

### Kubernetes Integration

```yaml
# Init container approach
initContainers:
- name: migrate
  image: lora-manager:latest
  command: ["./infrastructure/docker/migrate.sh"]
  env:
  - name: DATABASE_URL
    value: "postgresql+psycopg://user:pass@postgres:5432/lora"
```

## Migration Files Location

```
infrastructure/alembic/versions/
├── 5f681a8fe826_initial.py
├── 7176100dd1ac_add_unique_name_version.py  
├── 7ef61e651ef8_add_recommendation_tables.py
├── 952b85546fed_add_performance_indexes.py
├── a1f4d5d0b6c7_add_adapter_indexes_and_userpreference_idx.py
├── cbab2373ecb9_add_ingestion_tracking_fields.py
├── d16f3e1df8bd_add_complete_civitai_fields.py
└── e3c1f6a5c2b8_add_delivery_job_rating_and_favorites.py  # Fixes rating column
 └── f0a1b2c3d4e5_add_loraembedding_trigger_columns.py      # Adds trigger columns
```

## Troubleshooting

### Common Issues

1. **Migration fails with "no such column"**
   - Database schema is outdated
   - Solution: Run migrations manually or restart services

2. **Database connection timeout**
   - PostgreSQL not ready yet
   - Solution: Increase health check intervals

3. **Permission errors**
   - Migration scripts not executable
   - Solution: `chmod +x infrastructure/docker/*.sh`

### Debug Commands

```bash
# Check database connectivity
docker-compose exec api python -c "
from sqlalchemy import create_engine
import os
engine = create_engine(os.getenv('DATABASE_URL'))
connection = engine.connect()
print('Database connection successful!')
"

# View current migration status
docker-compose exec api sh -c "cd infrastructure && alembic current -v"

# Test migration script
docker-compose exec api ./infrastructure/docker/migrate.sh
```

## Environment Variables

Required for migrations:

```bash
# backend.env
DATABASE_URL=postgresql+psycopg://postgres:postgres@postgres:5432/lora
```

## Benefits of This Approach

✅ **Zero-downtime deployments**: Migrations run before API starts  
✅ **Health check dependencies**: Proper startup ordering  
✅ **Manual control**: Dedicated migration service when needed  
✅ **CI/CD ready**: Easy integration with deployment pipelines  
✅ **Production safe**: Uses infrastructure alembic config  
✅ **Rollback support**: Standard alembic downgrade capabilities  

This setup ensures that your database schema is always up-to-date when the API server starts, eliminating the "no such column" errors you were experiencing.
