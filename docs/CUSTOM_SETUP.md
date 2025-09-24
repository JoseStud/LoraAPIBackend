# Custom Environment Setup

This guide explains how to configure the LoRA Manager for your specific environment using environment variables and Docker Compose overrides. This allows you to integrate your existing model directories and custom settings without modifying the core application files.

## 🚀 Key Configuration Methods

1.  **Environment Variables (`.env` file):** The primary way to configure the application. You can control database connections, API keys, service URLs, and file paths.
2.  **Docker Compose Overrides:** For customizing Docker-specific settings like volume mounts to link your local model directories into the containers.

---

## 1. Environment Variable Configuration

The application uses a `.env` file in the project root to manage all configuration settings. You can create this file by copying the provided example:

```bash
cp .env.example .env
```

Then, edit the `.env` file to match your setup.

### Core Environment Variables

These are the most common variables you might want to change:

| Variable | Description | Example |
| --- | --- | --- |
| `DATABASE_URL` | Connection string for your database. | `postgresql+psycopg://user:pass@host:5432/db` |
| `REDIS_URL` | URL for the Redis server for background jobs. | `redis://redis:6379/0` |
| `API_KEY` | A secret key to protect the backend API. | `your-secret-api-key` |
| `BACKEND_PORT` | The port the backend API will run on. | `8000` |
| `IMPORT_PATH` | The directory *inside the container* to scan for LoRA files. | `/app/loras` |
| `SDNEXT_BASE_URL` | The URL for your SD.Next instance. | `http://localhost:7860` |
| `HF_TOKEN` | Your Hugging Face token for downloading models. | `hf_...` |

### Example `.env` file

```env
# .env

# -- Database and Cache --
# Use PostgreSQL for production
DATABASE_URL=postgresql+psycopg://postgres:postgres@postgres:5432/lora
# Use local SQLite for simple development
# DATABASE_URL=sqlite:///./db.sqlite
REDIS_URL=redis://redis:6379/0

# -- Security --
API_KEY=your-secret-api-key

# -- Application Paths (inside container) --
# This path will be mapped from your local machine in docker-compose.override.yml
IMPORT_PATH=/app/loras
OUTPUT_DIRECTORY=/app/outputs

# -- SD.Next Integration --
SDNEXT_BASE_URL=http://sdnext:7860
SDNEXT_TIMEOUT=180

# -- GPU Settings (for ROCm) --
# For RDNA3 (RX 7000 series)
HSA_OVERRIDE_GFX_VERSION=11.0.0
# For RDNA2 (RX 6000 series)
# HSA_OVERRIDE_GFX_VERSION=10.3.0
```

---

## 2. Customizing Docker with `docker-compose.override.yml`

To map your local model directories into the Docker containers, create a `docker-compose.override.yml` file. This file extends the base `docker-compose.yml` without modifying it directly.

### Example: Mapping Local Model Directories

Create a file named `docker-compose.override.yml` in the project root:

```yaml
# docker-compose.override.yml
version: '3.8'

services:
  backend:
    volumes:
      # Map your local LoRA directory to the path defined by IMPORT_PATH
      - /path/to/your/local/loras:/app/loras
      # Map your local outputs directory
      - /path/to/your/local/outputs:/app/outputs

  sdnext:
    volumes:
      # Map all your Stable Diffusion models
      - /path/to/your/models/Stable-diffusion:/app/models/Stable-diffusion
      - /path/to/your/models/VAE:/app/models/VAE
      - /path/to/your/models/Lora:/app/models/Lora
      # Add any other model directories you need
```

**Replace `/path/to/your/local/...` with the absolute paths to your directories.**

---

## 3. Running Your Custom Setup

With your `.env` and `docker-compose.override.yml` files in place, you can start the application using the standard Docker Compose commands.

```bash
# For NVIDIA GPU or CPU
docker-compose up -d

# For AMD ROCm GPU
docker-compose -f docker-compose.yml -f docker-compose.rocm.yml up -d
```

Docker Compose will automatically merge the configurations, giving you a customized setup that uses your own files and settings.

### Accessing the Services

- **LoRA Backend API**: `http://localhost:8782` when using the provided Docker compose files (the container publishes port 8782
  on the host). Local `uvicorn` development still defaults to `http://localhost:8000` unless you override `BACKEND_PORT`.
- **API Documentation**: `http://localhost:8782/docs`
- **SD.Next WebUI**: `http://localhost:7860`

When developing the frontend against the Docker backend, point the Vite proxy at the exposed port and provide the API key that
the containers expect:

```bash
BACKEND_URL=http://localhost:8782 \
VITE_BACKEND_API_KEY=dev-api-key-123 \
npm run dev
```

The frontend also honours `VITE_API_KEY` for compatibility with older `.env` files.
