# Custom Environment Setup

This guide explains how to configure the LoRA Manager for your specific environment using environment variables and Docker Compose overrides. This allows you to integrate your existing model directories and custom settings without modifying the core application files.

## 🚀 Key Configuration Methods

1.  **Environment Variables (`.env` file):** The primary way to configure the application. You can control database connections, API keys, service URLs, and file paths.
2.  **Docker Compose Overrides:** For customizing Docker-specific settings like volume mounts to link your local model directories into the containers.

---

## External SDNext (recommended for GPU)

The project no longer ships GPU/ROCm SDNext containers. For NVIDIA or AMD (ROCm) acceleration, run SDNext as a normal install on the host so it uses your native drivers, and let the Docker dev stack (`docker-compose.dev.yml`) connect to it.

1.  **Start SDNext on the host** with its API reachable from containers:

    ```bash
    cd /path/to/sdnext
    ./webui.sh --listen    # add --use-rocm / --use-cuda as appropriate
    ```

    `--listen` binds to `0.0.0.0`, which is required for containers to reach it via `host.docker.internal`.

2.  **Configure `.env.docker`** in the project root:

    ```bash
    cp .env.docker.example .env.docker
    ```

    ```env
    # .env.docker
    SDNEXT_BASE_URL=http://host.docker.internal:7860
    # Share SDNext's LoRA folder with the backend
    LORA_HOST_DIR=/path/to/sdnext/models/Lora
    ```

    The `api` service maps `host.docker.internal` to the host gateway, so this works on Linux as well as Docker Desktop. Leave `SDNEXT_BASE_URL` empty to run without generation.

3.  **Start the stack**:

    ```bash
    make dev
    ```

GPU tuning (e.g. `HSA_OVERRIDE_GFX_VERSION` for ROCm) is applied to the host SDNext process, not the containers. See the [ROCm Troubleshooting Guide](ROCM_TROUBLESHOOTING.md).

---

## 1. Environment Variable Configuration

`make dev` reads `.env.docker` when it exists and falls back to `.env.docker.example`. Start from the example:

```bash
cp .env.docker.example .env.docker
```

When running the backend outside Docker (`npm run dev:backend`), the same variables can be exported in your shell or placed in a `.env` file in the project root.

### Core Environment Variables

| Variable | Description | Example |
| --- | --- | --- |
| `DATABASE_URL` | Connection string for your database. | `postgresql+psycopg://user:pass@host:5432/db` |
| `REDIS_URL` | URL for the Redis server for background jobs. | `redis://redis:6379/0` |
| `API_KEY` | Shared key sent in `X-API-Key`. See the security note in the README; it is not an access control. | `dev-token` |
| `SDNEXT_BASE_URL` | The URL for your SD.Next instance. | `http://host.docker.internal:7860` |
| `LORA_HOST_DIR` | Host folder mounted as the LoRA library (`/app/loras`). | `/path/to/sdnext/models/Lora` |
| `DB_HOST_PORT` | Host port for the dev Postgres container. | `5433` |
| `HF_TOKEN` | Your Hugging Face token for downloading models. | `hf_...` |

---

## 2. Customising the Dev Stack

Prefer environment variables (above) over editing `docker-compose.dev.yml`. For changes the variables don't cover, such as extra volume mounts, add an override file and pass both files to Compose:

```yaml
# docker-compose.override.yml
services:
  api:
    volumes:
      - /path/to/your/outputs:/app/outputs
```

```bash
make dev COMPOSE_FILE="docker-compose.dev.yml -f docker-compose.override.yml"
```

### Accessing the Services

- **LoRA Backend API**: `http://localhost:8000` (versioned routes under `/v1`)
- **API Documentation**: `http://localhost:8000/docs`
- **Frontend (Vite)**: `http://localhost:5173`
- **SD.Next WebUI**: `http://localhost:7860` (the host install from the External SDNext section)

Quick health check once the stack is up:

```bash
curl http://localhost:8000/v1/system/status
```
