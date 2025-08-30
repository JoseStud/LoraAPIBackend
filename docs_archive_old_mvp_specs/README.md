
# LoRA Manager Backend

A FastAPI backend for managing and composing LoRA (Low-Rank Adaptation) models. This project provides a simple but powerful API to track LoRA metadata, compose prompts, and schedule asynchronous delivery jobs.

## Current Status

This project is under active development. It has a solid foundation with a working API, database persistence, and a background worker system. It is suitable for local testing and initial data ingestion. However, key production features like comprehensive security and database indexing are still in progress.

## Features

*   **Adapter Management**: A full CRUD API for managing LoRA adapter metadata.
*   **SDNext Integration**: Complete integration with SDNext (Stable Diffusion) for real-time image generation using LoRA models.
*   **WebSocket Progress Monitoring**: Real-time progress updates for generation jobs with comprehensive status tracking.
*   **Automated Metadata Ingestion**: Comprehensive importer service that scans directories, parses Civitai JSON files, and automatically registers LoRAs.
*   **Prompt Composition**: An endpoint to dynamically build prompts from a weighted and ordered list of active LoRAs.
*   **Asynchronous Job Delivery**: A background worker system using Redis and RQ to handle deliveries and generation jobs.
*   **Modular Service Architecture**: Clean separation of concerns with dependency injection and plugin-based delivery backends.
*   **Flexible Persistence**: Uses SQLModel for data persistence, supporting SQLite out-of-the-box and PostgreSQL for production deployments.
*   **Database Migrations**: Includes Alembic for managing database schema changes.
*   **Simple Security**: Optional API key authentication to protect endpoints.
*   **Containerized Environment**: Multiple Docker compose configurations for different deployment scenarios (GPU, CPU, development).

## Getting Started

### Prerequisites

*   Docker & Docker Compose
*   (Optional) NVIDIA Container Toolkit for GPU support

### Quick Start with SDNext Integration

The fastest way to get started with full SDNext (Stable Diffusion) integration:

```bash
# 1. Setup directories and configuration
./setup_sdnext_docker.sh

# 2. Choose your setup based on hardware:

# For GPU (recommended):
docker-compose -f docker-compose.gpu.yml up -d

# For AMD ROCm (AMD GPUs):
docker-compose -f docker-compose.rocm.yml up -d

# For CPU only (testing):
docker-compose -f docker-compose.cpu.yml up -d

# Default (auto-detect):
docker-compose up -d

# 3. Check status
./check_health.sh

# 4. Test WebSocket integration
# Option A: HTML client (open in browser)
open websocket_test_client.html

# Option B: Python client (install: pip install websockets aiohttp)
python websocket_client_example.py
./check_health.sh
```

**Services Available:**
- **LoRA Backend API**: http://localhost:8782
- **SDNext WebUI**: http://localhost:7860
- **API Documentation**: http://localhost:8782/docs
- **WebSocket Monitor**: ws://localhost:8782/ws/progress

### AMD ROCm Setup (AMD GPUs)

For AMD GPU users, use the ROCm-optimized configuration:

```bash
# 1. Ensure ROCm is installed on your system
# Follow: https://github.com/vladmandic/sdnext/wiki/AMD-ROCm

# 2. Setup and start with ROCm
./setup_sdnext_docker.sh
docker-compose -f docker-compose.rocm.yml up -d

# 3. Check status
./check_health.sh
```

**ROCm Configuration Notes:**
- Uses `disty0/sdnext-rocm:latest` Docker image with ROCm support
- Automatically detects GPU architecture (RDNA1/2/3) and sets `HSA_OVERRIDE_GFX_VERSION`
- Includes device access to `/dev/dri` and `/dev/kfd` for GPU acceleration
- Optimized environment variables for AMD GPU performance
- Edit `.env.rocm` for manual GPU architecture tuning

### Manual Configuration

The application is configured using environment variables. For SDNext integration, use the provided setup script or create a `.env` file:

```bash
# SDNext Integration (automatically configured by setup script)
SDNEXT_BASE_URL=http://sdnext:7860
SDNEXT_TIMEOUT=120
SDNEXT_DEFAULT_STEPS=20
SDNEXT_DEFAULT_SAMPLER=DPM++ 2M

# API Security
API_KEY=your-secret-api-key

# Database (pre-configured in docker-compose)
DATABASE_URL=postgresql+psycopg://postgres:postgres@postgres:5432/lora
REDIS_URL=redis://redis:6379/0
```

### Legacy Setup (API Only)

With Docker and Docker Compose installed, you can start all services with a single command:

```bash
docker-compose up --build
```

This will start the FastAPI application (available at `http://localhost:8782`), the RQ worker, a PostgreSQL database, and a Redis instance.

### 3. Applying Database Migrations

Once the containers are running, open a new terminal and run the Alembic migrations to set up the database schema:

```bash
docker-compose exec api alembic upgrade head
```

The application is now ready to use.

## Usage

### Authentication

If you have set an `API_KEY` in your `.env` file, you must include it in your requests using the `X-API-Key` header:

```
X-API-Key: your-secret-api-key
```

If the `API_KEY` is not set, no header is required.

### Image Generation with SDNext

The backend provides integrated image generation capabilities through SDNext. You can generate images using your registered LoRA adapters:

#### Available Generation Endpoints

- **Text to Image**: `POST /compose/txt2img` - Generate images from text prompts
- **Image to Image**: `POST /compose/img2img` - Transform existing images
- **Inpainting**: `POST /compose/inpaint` - Fill in masked areas of images
- **Extras**: `POST /compose/extras` - Upscale and enhance images
- **ControlNet**: `POST /compose/controlnet` - Generate with structural guidance
- **Infinite Image**: `POST /compose/infinite` - Create extended/panoramic images

#### Real-time Progress Monitoring

Connect to the WebSocket endpoint for real-time generation progress:

```javascript
const ws = new WebSocket('ws://localhost:8782/ws/progress');
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Progress:', data.progress, 'Status:', data.status);
};
```

#### Example Generation Request

```bash
curl -X POST "http://localhost:8782/compose/txt2img" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-api-key" \
  -d '{
    "prompt": "a beautiful landscape with mountains",
    "negative_prompt": "blurry, low quality",
    "width": 512,
    "height": 512,
    "steps": 20,
    "cfg_scale": 7.0,
    "sampler_name": "DPM++ 2M Karras",
    "lora_adapters": ["your-lora-name"]
  }'
```

The system will automatically:
1. Queue your generation request
2. Apply selected LoRA adapters
3. Send real-time progress updates via WebSocket
4. Return the generated image and metadata

### Ingesting a LoRA (Planned)

The current ingestion process is a manual metadata registration. The next phase of development will introduce an **automated importer service**.

This service will scan a designated local directory (e.g., `/loras`) for model files (like `.safetensors`) and their corresponding Civitai metadata files (`.json`).

**Example Workflow**:

1.  You place your files in the shared LoRA directory:
    *   `/loras/characters/My-Character-LoRA.safetensors`
    *   `/loras/characters/My-Character-LoRA.json`
2.  The `Importer` service detects the new files.
3.  It parses `My-Character-LoRA.json` to extract the name, version, tags, trigger words, and other details.
4.  It calls the API to register the adapter, making the Civitai JSON the source of truth for metadata.

This automated workflow will replace the current need to send manual `POST` requests.

## Next Steps

The immediate priorities for this project are to build out the core features that bridge the gap between metadata management and a fully functional LoRA delivery system.

1.  **Implement the Importer Service**:
    *   Create a background service that scans the designated LoRA directory.
    *   Parse the Civitai `.json` files to extract rich metadata (name, trigger words, tags, etc.).
    *   Update the `Adapter` model and database schema to store this new information.
    *   Call the API to automatically register or update LoRAs in the database.

2.  **Enhanced Generation Features** ✅ **COMPLETED**:
    *   ✅ Implemented complete SDNext integration with 6 generation endpoints
    *   ✅ Real-time WebSocket progress monitoring
    *   ✅ Pluggable delivery adapter architecture
    *   ✅ Docker containerization with SDNext service
    *   **Future**: ControlNet advanced features, batch processing

3.  **Begin UI Development**:
    *   Scaffold a basic React + Vite frontend application.
    *   Create views for listing, viewing, and managing LoRA adapters by calling the backend API.
    *   Implement a UI for composing prompts and monitoring generation progress.
    *   Integrate with WebSocket for real-time generation updates.

## Development

For more detailed information on the project's architecture, design decisions, and how to contribute, please see the [DEVELOPMENT.md](DEVELOPMENT.md) file.

### Running Tests

To run the test suite, first install the development dependencies and then run pytest:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r dev-requirements.txt
pytest
```

### Testing WebSocket Integration

Two test clients are provided to test the real-time generation monitoring:

#### HTML Test Client
Open `websocket_test_client.html` in your browser for an interactive test interface:
- Connect to WebSocket endpoint
- Submit generation requests
- Monitor real-time progress
- View detailed event logs

#### Python Test Client
For command-line testing:

```bash
# Install dependencies
pip install websockets aiohttp

# Run test client
python websocket_client_example.py --host localhost --port 8782

# With API key
python websocket_client_example.py --api-key your-secret-key
```

Both clients demonstrate the complete workflow:
1. WebSocket connection to `/ws/progress`
2. HTTP POST to generation endpoints (e.g., `/compose/txt2img`)
3. Real-time progress monitoring
4. Completion notification
