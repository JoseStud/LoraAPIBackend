# Custom Setup for DeepVault Environment

This configuration is specifically tailored for anxilinux's DeepVault environment with your existing model structure and preferences.

## Your Configuration

### Models & Paths
- **Main Model**: novaAnimeXL_ilV100 [7ce4d60ef4]
- **VAE**: sdxl_vae.safetensors  
- **Precision**: FP16
- **Theme**: Modern
- **Model Directory**: `/home/anxilinux/DeepVault/models/`
- **LoRA Directory**: `/home/anxilinux/DeepVault/models/Lora/`

### Quick Start

```bash
# 1. Run your custom setup
./setup_custom.sh

# 2. Start with ROCm (if you have AMD GPU)
docker-compose -f docker-compose.rocm.yml up -d

# 3. Or start with NVIDIA GPU
docker-compose -f docker-compose.gpu.yml up -d

# 4. Check status
./check_health.sh
```

## What's Configured

### Volume Mappings
All your existing DeepVault model directories are mapped:
- `/home/anxilinux/DeepVault/models/Stable-diffusion` → `/app/models/Stable-diffusion`
- `/home/anxilinux/DeepVault/models/Lora` → `/app/models/Lora`
- `/home/anxilinux/DeepVault/models/VAE` → `/app/models/VAE`
- `/home/anxilinux/DeepVault/models/huggingface` → `/app/models/huggingface`
- And all other subdirectories...

### SDNext Configuration
Your exact `config.json` settings:
- All your model directories mapped correctly
- Your Hugging Face token configured
- Your preferred UI settings (Modern theme, etc.)
- Your specific model and VAE selections
- All your optimization settings

### Environment Files
- `.env.custom` - Standard configuration
- `.env.rocm.custom` - ROCm-optimized for AMD GPUs

## ROCm Optimization

If using AMD GPU, the setup automatically detects your GPU architecture:
- **RDNA3 (RX 7000)**: HSA_OVERRIDE_GFX_VERSION=11.0.0
- **RDNA2 (RX 6000)**: HSA_OVERRIDE_GFX_VERSION=10.3.0
- **RDNA1 (RX 5000)**: HSA_OVERRIDE_GFX_VERSION=10.1.0

## Testing

Your setup includes WebSocket test clients:
```bash
# HTML client (recommended)
open websocket_test_client.html

# Python client
python websocket_client_example.py
```

## Services

- **LoRA Backend API**: http://localhost:8782
- **SDNext WebUI**: http://localhost:7860  
- **API Documentation**: http://localhost:8782/docs
- **WebSocket Progress**: ws://localhost:8782/ws/progress

Your existing models and LoRAs will be immediately available without any file copying or migration needed!
