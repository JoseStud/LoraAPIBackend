# Docker Setup for LoRA Manager

This directory contains Docker configurations for running the LoRA Manager system with different hardware configurations.

## 🚀 Quick Start

### Development stack

1. Copy the sample environment and adjust paths or ports as needed:

   ```bash
   cp ../../.env.docker.example ../../.env.docker
   ```

2. Start the full development workflow (API, worker, frontend, PostgreSQL, Redis):

   ```bash
   make docker-dev-up
   ```

   Use `make docker-dev-up-sdnext` to include the optional SDNext profile. Logs
   are available via `make docker-dev-logs`, and `make docker-dev-down` stops
   and removes the stack when you are finished.

### Hardware-specific Compose files

The legacy Compose files remain available for specialised environments:

- **NVIDIA GPU**:
  ```bash
  docker compose -f docker-compose.gpu.yml up
  ```
- **AMD GPU (ROCm)** (overlay the ROCm overrides):
  ```bash
  docker compose --env-file .env.docker \
    -f docker-compose.dev.yml \
    -f docker-compose.rocm.override.yml \
    --profile sdnext up
  ```
  The Makefile exposes this via `make docker-dev-up-rocm`.
- **CPU only**:
  ```bash
  docker compose -f docker-compose.cpu.yml up
  ```

All variants accept the same `.env.docker` file for shared environment
settings.

## 📋 Available Services

### Core Services
- **Redis** (`redis:7`) - Job queue and caching (port 6380)
- **PostgreSQL** (`postgres:15`) - Main database (port 5433)
- **API Server** - LoRA Manager backend API (port 8782)
- **Worker** - Background job processor

### AI Generation Service
- **SDNext** - Stable Diffusion WebUI for image generation (port 7860)
  - Auto-configured with your model directories
  - API enabled for integration
  - WebSocket progress monitoring

## 🔧 Configuration Files

### docker-compose.dev.yml
- **Purpose**: Primary development stack (API, worker, frontend, PostgreSQL, Redis)
- **Features**:
  - Hot-reload friendly mounts with host UID/GID overrides
  - Optional SDNext profile (`--profile sdnext` or `make docker-dev-up-sdnext`)
  - Works with the shared `.env.docker` configuration file

### docker-compose.rocm.override.yml
- **Purpose**: ROCm-specific overrides layered on top of `docker-compose.dev.yml`
- **Features**:
  - Switches SDNext to the ROCm image with device mounts and performance flags
  - Mounts a configurable host models directory via `ROCM_MODELS_ROOT`
  - Reuses the same project name so CPU/ROCm workflows stay in sync

### docker-compose.yml
- **Purpose**: Legacy auto-detect setup kept for backwards compatibility
- **GPU**: None (CPU inference only)
- **Use case**: Quick testing without the new dev workflow

### docker-compose.gpu.yml
- **Purpose**: NVIDIA GPU-accelerated setup
- **GPU**: NVIDIA with CUDA support
- **Features**:
  - Hardware GPU acceleration
  - Optimized for faster generation
  - Custom model directory mounting
  - Development-friendly settings

### docker-compose.cpu.yml
- **Purpose**: CPU-only production setup
- **GPU**: None
- **Use case**: Servers without GPU, testing

### Dockerfile.dev.api / Dockerfile.dev.frontend
- **Purpose**: Development images for the API and Vite dev server with
  accumulative dependency caches and UID/GID overrides
- **Use case**: Consistent containerised development when using
  `docker-compose.dev.yml`

## 🏗️ Project Structure

```
infrastructure/docker/
├── docker-compose.yml          # Basic development setup
├── docker-compose.gpu.yml      # NVIDIA GPU setup
├── docker-compose.rocm.override.yml # ROCm overrides layered on dev compose
├── docker-compose.cpu.yml      # CPU-only setup
├── Dockerfile                  # Backend API container
├── sdnext_config/             # SDNext configuration files
├── sdnext_src/                # SDNext source code
├── loras/                     # LoRA model storage
└── outputs/                   # Generated images storage
```

## 🔌 Port Configuration

| Service | Internal Port | External Port | Description |
|---------|---------------|---------------|-------------|
| API Server | 8000 | 8782 | LoRA Manager API |
| SDNext | 7860 | 7860 | Stable Diffusion WebUI |
| PostgreSQL | 5432 | 5433 | Database |
| Redis | 6379 | 6380 | Job queue |

## 💾 Volume Mounts

### Model Directories (GPU setups)
Your DeepVault model structure is automatically mounted:
- `/home/anxilinux/DeepVault/models/Stable-diffusion` → `/app/models/Stable-diffusion`
- `/home/anxilinux/DeepVault/models/Lora` → `/app/models/Lora`
- `/home/anxilinux/DeepVault/models/VAE` → `/app/models/VAE`
- And all other model subdirectories...

### Persistent Data
- `postgres_data` - Database storage
- `sdnext_data` - SDNext extensions and repositories
- `sdnext_outputs` - Generated images

## 🌍 Environment Variables

### Shared Defaults (`.env.docker`)

- Copy `.env.docker.example` to `.env.docker` in the repository root and adjust
  it to your environment.
- All docker-compose variants read this file through `--env-file`, keeping port
  mappings, credentials, and optional paths consistent across services.
- Override values on demand by prefixing commands, e.g. `API_PORT=8080 make docker-dev-up`.

### Legacy `backend.env`

- The file is still available for older automation that sourced it directly.
- New workflows should prefer `.env.docker` to avoid duplicating configuration.

### Backend Configuration
- `REDIS_URL` - Redis connection string
- `DATABASE_URL` - PostgreSQL connection string
- `API_KEY` - Optional API authentication

### SDNext Integration
- `SDNEXT_BASE_URL` - SDNext server URL
- `SDNEXT_TIMEOUT` - Request timeout (120s default, 180s for GPU)
- `SDNEXT_POLL_INTERVAL` - Progress polling interval
- `SDNEXT_DEFAULT_STEPS` - Default generation steps
- `SDNEXT_DEFAULT_SAMPLER` - Default sampler method

### ROCm-Specific (AMD GPUs)
- `ROCM_MODELS_ROOT` - Host root directory containing Stable Diffusion assets
- `ROCM_SDNEXT_IMAGE` - SDNext ROCm image to run
- `ROCM_SDNEXT_COMMANDLINE_ARGS` - Additional startup flags for SDNext
- `HSA_OVERRIDE_GFX_VERSION` - GPU architecture version
- `HIP_VISIBLE_DEVICES` - GPU device selection
- `MIOPEN_FIND_MODE` - Performance vs startup time trade-off
- `MIOPEN_USER_DB_PATH` - Cache location for MIOpen tuning data

## 🚀 Development Workflow

### ⚠️ Quick Fix for 403 API Errors

If you see `HTTP/1.1 403 Forbidden` errors in the browser console, the frontend needs API authentication configured:

```bash
# Create frontend environment file with API key
echo "VITE_API_KEY=dev-api-key-123" > app/frontend/.env.local

# Restart the Vite dev server
npm run dev
```

This matches the `API_KEY` configured in the Docker backend.

### 1. First-time Setup
```bash
# Clone and prepare
git clone <repository>
cd lora-manager

# Copy environment defaults and start the stack (CPU/standard workflow)
cp .env.docker.example .env.docker
make docker-dev-up
```

Use `make docker-dev-up-sdnext` when you want the SDNext profile enabled, or
`make docker-dev-up-rocm` to start the same stack with ROCm overrides.

### 2. Frontend Development (Vite)
The `frontend` container in `docker-compose.dev.yml` already runs `npm run dev`
with hot reload. Open <http://localhost:5173> to access it from the host. When
you need to run the Vite server directly on your machine instead, stop the
container and follow the usual host workflow:

```bash
npm install
npm run dev
```

### 3. Backend Development
```bash
# Rebuild images after dependency changes
make docker-dev-rebuild

# Tail API logs
make docker-dev-logs

# Drop into the container shell for alembic or debugging
make docker-dev-shell

# Stop services
make docker-dev-down
```
Use the `*-rocm` Makefile targets (for example `make docker-dev-logs-rocm`) when
the ROCm override file is active so `docker compose` evaluates the same file set
during teardown and log inspection.

### 4. Access Points
- **LoRA Manager API**: http://localhost:8782
- **API Documentation**: http://localhost:8782/docs
- **SDNext WebUI**: http://localhost:7860
- **Database**: localhost:5433 (postgres/postgres)
- **Vite Dev Server** (development): http://localhost:5173

## 🐛 Troubleshooting

### Common Issues

**SDNext fails to start:**
- Check GPU drivers are installed
- Verify model directories exist and are readable
- Check disk space for model downloads

**API connection errors:**
- Ensure backend builds successfully: `docker compose --env-file .env.docker -f infrastructure/docker/docker-compose.dev.yml logs api`
- Check database connection: `docker compose --env-file .env.docker -f infrastructure/docker/docker-compose.dev.yml logs postgres`
- Verify Redis is running: `docker compose --env-file .env.docker -f infrastructure/docker/docker-compose.dev.yml logs redis`

**Permission errors:**
- Ensure model directories have correct permissions
- Check Docker daemon has access to mounted paths

### Health Checks
```bash
# Check all services
docker compose --env-file .env.docker -f infrastructure/docker/docker-compose.dev.yml ps

# Test API health
curl http://localhost:8782/health

# Test SDNext API
curl http://localhost:7860/sdapi/v1/options
```

## 🧩 Database Migrations

- Migrations run automatically on API startup via `infrastructure/docker/start-api.sh` across all compose variants (base/GPU/ROCm).
- The entrypoint waits for the database, applies `infrastructure/alembic` migrations to head, then starts Uvicorn.
- Programmatic app migrations are disabled in Docker with `SKIP_APP_DB_MIGRATIONS=1` to avoid duplicate runs.

Manual control (optional):
```bash
# One-off migration run
docker compose --env-file .env.docker -f infrastructure/docker/docker-compose.yml --profile migration run --rm migrate

# Inspect status
docker compose --env-file .env.docker -f infrastructure/docker/docker-compose.yml exec api sh -c "cd infrastructure && alembic current -v"
```

## 🔧 Customization

### Custom Model Paths
Edit the volume mounts in your chosen compose file:
```yaml
volumes:
  - /your/custom/path:/app/models/Stable-diffusion
```

### Performance Tuning
- **GPU Memory**: Adjust SDNext command args in compose files
- **Worker Scaling**: Add more worker services in compose files
- **Database**: Tune PostgreSQL settings for your workload

### Security
- Change default passwords in production
- Use environment files for sensitive configuration
- Enable API authentication with `API_KEY`

## 📚 Additional Resources

- **SDNext Documentation**: See `sdnext_src/wiki/` for comprehensive guides
- **Model Setup**: Check [Custom Setup Guide](../../docs/CUSTOM_SETUP.md)
- **GPU Troubleshooting**: See [ROCm Setup Guide](../../docs/ROCM_TROUBLESHOOTING.md)
