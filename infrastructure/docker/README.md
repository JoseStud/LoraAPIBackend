# Docker Setup for LoRA Manager

This directory contains Docker configurations for running the LoRA Manager stack.

> **GPU generation:** SDNext is no longer built or bundled for GPUs here. Run SDNext
> directly on the host (with `--listen`) so it uses your native CUDA/ROCm install, and
> point the containers at it. See [External SDNext](../../docs/CUSTOM_SETUP.md#external-sdnext-recommended-for-gpu).

## 🚀 Quick Start

### Choose Your Configuration

1. **Auto-detect setup** (recommended for development):
   ```bash
   docker-compose up
   ```

2. **CPU only**:
   ```bash
   docker-compose -f docker-compose.cpu.yml up
   ```

3. **GPU (NVIDIA or AMD/ROCm) via an external SDNext** — from the repository root:
   ```bash
   cp .env.docker.example .env.docker   # set SDNEXT_BASE_URL and LORA_HOST_DIR
   make dev
   ```

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

### docker-compose.yml
- **Purpose**: Development setup with basic configuration
- **GPU**: None (CPU inference only)
- **Use case**: Quick testing, development without GPU

### docker-compose.cpu.yml
- **Purpose**: CPU-only production setup
- **GPU**: None
- **Use case**: Servers without GPU, testing

### GPU setups
GPU-accelerated generation uses an SDNext instance running on the host rather than a
container. The root `docker-compose.dev.yml` (`make dev`) reaches it through
`SDNEXT_BASE_URL=http://host.docker.internal:7860` and mounts `LORA_HOST_DIR` as the
LoRA library. See [External SDNext](../../docs/CUSTOM_SETUP.md#external-sdnext-recommended-for-gpu).

## 🏗️ Project Structure

```
infrastructure/docker/
├── docker-compose.yml          # Basic development setup
├── docker-compose.cpu.yml      # CPU-only setup
├── Dockerfile                  # Backend API container
├── sdnext_config/             # SDNext configuration files
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
With an external SDNext, models stay in the host SDNext install. Set `LORA_HOST_DIR`
in `.env.docker` to SDNext's `models/Lora` folder so the backend and SDNext see the
same LoRA files.

### Persistent Data
- `postgres_data` - Database storage
- `sdnext_data` - SDNext extensions and repositories
- `sdnext_outputs` - Generated images

## 🌍 Environment Variables

### Shared Defaults (`backend.env`)

- The API and worker services both load values from [`backend.env`](./backend.env).
- Copy this file to `backend.env.local` (kept out of git) to provide custom values, then run `docker compose --env-file backend.env.local ...`.
- Alternatively override individual settings inline: `SDNEXT_TIMEOUT=300 docker compose up`.
- The shared file keeps Redis, PostgreSQL, and SDNext configuration in sync across compose variants.

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
ROCm variables such as `HSA_OVERRIDE_GFX_VERSION` belong to the host SDNext process,
not these containers. See the [ROCm Troubleshooting Guide](../../docs/ROCM_TROUBLESHOOTING.md).

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

# Start SDNext on the host with --listen, then configure and start the stack
cp .env.docker.example .env.docker   # set SDNEXT_BASE_URL and LORA_HOST_DIR
make dev
```

### 2. Frontend Development (Vite)
The project now uses Vite for modern frontend development:

```bash
# Option 1: Frontend development with hot reload (recommended)
# Terminal 1: Start backend services
docker-compose -f infrastructure/docker/docker-compose.yml up

# Terminal 2: Start Vite dev server
npm install
npm run dev  # Serves on localhost:5173

# Access: http://localhost:8782 (backend serves frontend in production mode)
# OR: http://localhost:5173 (Vite dev server with hot reload)
```

```bash
# Option 2: Production build testing
npm run build  # Build frontend assets
docker-compose -f infrastructure/docker/docker-compose.yml up
# Access: http://localhost:8782 (backend serves built assets)
```

### 3. Backend Development
```bash
# Start with rebuild
docker-compose -f infrastructure/docker/docker-compose.yml up --build

# View logs
docker-compose -f infrastructure/docker/docker-compose.yml logs -f api

# Stop services
docker-compose -f infrastructure/docker/docker-compose.yml down
```

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
- Ensure backend builds successfully: `docker-compose logs api`
- Check database connection: `docker-compose logs postgres`
- Verify Redis is running: `docker-compose logs redis`

**Permission errors:**
- Ensure model directories have correct permissions
- Check Docker daemon has access to mounted paths

### Health Checks
```bash
# Check all services
docker-compose -f infrastructure/docker/docker-compose.yml ps

# Test API health
curl http://localhost:8782/health

# Test SDNext API
curl http://localhost:7860/sdapi/v1/options
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

- **SDNext Documentation**: See the [SDNext wiki](https://github.com/vladmandic/sdnext/wiki)
- **Model Setup**: Check [Custom Setup Guide](../../docs/CUSTOM_SETUP.md)
- **GPU Troubleshooting**: See [ROCm Setup Guide](../../docs/ROCM_TROUBLESHOOTING.md)
