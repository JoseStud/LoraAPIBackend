#!/bin/bash

# Setup script for SDNext + LoRA Backend Docker integration
# This script creates the necessary directories and downloads basic models
# Supports NVIDIA GPU, AMD ROCm, and CPU configurations

set -e

echo "🚀 Setting up SDNext + LoRA Backend Docker Environment"
echo

# Detect hardware and recommend configuration
detect_hardware() {
    echo "🔍 Detecting hardware configuration..."
    
    # Check for NVIDIA GPU
    if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
        echo "✅ NVIDIA GPU detected"
        echo "   Recommended: docker-compose -f docker-compose.gpu.yml up"
        return 0
    fi
    
    # Check for AMD GPU with ROCm
    if command -v rocm-smi >/dev/null 2>&1 && rocm-smi >/dev/null 2>&1; then
        echo "✅ AMD GPU with ROCm detected"
        echo "   Recommended: docker-compose -f docker-compose.rocm.yml up"
        return 0
    elif lspci | grep -i amd | grep -i vga >/dev/null 2>&1; then
        echo "⚠️  AMD GPU detected but ROCm not found"
        echo "   Install ROCm for GPU acceleration or use CPU mode"
        echo "   ROCm installation: https://github.com/vladmandic/sdnext/wiki/AMD-ROCm"
        echo "   Fallback: docker-compose -f docker-compose.cpu.yml up"
        return 0
    fi
    
    echo "💻 No GPU detected, using CPU mode"
    echo "   Recommended: docker-compose -f docker-compose.cpu.yml up"
}

detect_hardware
echo

# Create required directories (based on user's existing structure)
echo "📁 Creating directory structure..."
mkdir -p models/Stable-diffusion
mkdir -p models/Diffusers
mkdir -p models/huggingface
mkdir -p models/VAE
mkdir -p models/UNET
mkdir -p models/Text-encoder
mkdir -p models/Lora
mkdir -p models/tunable
mkdir -p models/embeddings
mkdir -p models/ONNX/temp
mkdir -p models/styles
mkdir -p models/yolo
mkdir -p models/wildcards
mkdir -p loras
mkdir -p sdnext_config
mkdir -p outputs

echo "✅ Directory structure created (matching your existing DeepVault structure)"

# Create SDNext configuration
echo "⚙️ Creating SDNext configuration..."

cat > sdnext_config/config.json << 'EOF'
{
  "samples_save": true,
  "samples_format": "png",
  "samples_filename_pattern": "[seed]-[prompt_spaces]",
  "save_images_add_number": true,
  "grid_save": true,
  "grid_format": "png",
  "grid_extended_filename": false,
  "grid_only_if_multiple": true,
  "return_grid": true,
  "do_not_show_images": false,
  "add_model_hash_to_info": true,
  "add_model_name_to_info": true,
  "disable_weights_auto_swap": false,
  "send_seed": true,
  "send_size": true,
  "font": "",
  "js_modal_lightbox": true,
  "js_modal_lightbox_initially_zoomed": true,
  "show_progress_in_title": true,
  "samplers_in_dropdown": true,
  "dimensions_and_batch_together": true,
  "keyedit_precision_attention": 0.1,
  "keyedit_precision_extra": 0.05,
  "keyedit_delimiters": ".,\\/!?%^*;:{}=`~()",
  "quicksettings": "sd_model_checkpoint,sd_vae,CLIP_stop_at_last_layers,img2img_background_color,img2img_color_correction,samples_save,samples_format",
  "ui_reorder": "inpaint, sampler, checkboxes, hires_fix, dimensions, cfg, seed, batch, override_settings, scripts",
  "ui_extra_networks_tab_reorder": "",
  "localization": "None",
  "show_warnings": false,
  "show_gradio_deprecation_warnings": true,
  "memmon_poll_rate": 8,
  "samples_log_stdout": false,
  "multiple_tqdm": true,
  "print_hypernet_extra": false,
  "unload_models_when_training": false,
  "pin_memory": false,
  "save_optimizer_state": false,
  "save_training_settings_to_txt": true,
  "dataset_filename_word_regex": "",
  "dataset_filename_join_string": " ",
  "training_image_repeats_per_epoch": 1,
  "training_write_csv_every": 500,
  "training_xattention_optimizations": false,
  "training_enable_tensorboard": false,
  "training_tensorboard_save_images": false,
  "training_tensorboard_flush_every": 120,
  "sd_model_checkpoint": "",
  "sd_checkpoint_cache": 0,
  "sd_vae_checkpoint_cache": 0,
  "sd_vae": "Automatic",
  "sd_vae_as_default": true,
  "inpainting_mask_weight": 1.0,
  "initial_noise_multiplier": 1.0,
  "img2img_color_correction": false,
  "img2img_fix_steps": false,
  "img2img_background_color": "#ffffff",
  "enable_quantization": false,
  "enable_emphasis": true,
  "enable_batch_seeds": true,
  "comma_padding_backtrack": 20,
  "CLIP_stop_at_last_layers": 1,
  "upcast_attn": false,
  "use_old_emphasis_implementation": false,
  "use_old_karras_scheduler_sigmas": false,
  "no_dpmpp_sde_batch_determinism": false,
  "use_old_hires_fix_width_height": false,
  "dont_fix_second_order_samplers_schedule": false,
  "hires_fix_use_firstpass_conds": false,
  "use_old_scheduling": false
}
EOF

echo "✅ SDNext configuration created"

# Create .env file with default settings
echo "📝 Creating environment configuration..."

cat > .env << 'EOF'
# LoRA Backend + SDNext Docker Configuration

# Choose your setup:
# For GPU: docker-compose -f docker-compose.gpu.yml up
# For CPU: docker-compose -f docker-compose.cpu.yml up
# Default: docker-compose up (auto-detects GPU)

# SDNext Configuration
SDNEXT_BASE_URL=http://sdnext:7860
SDNEXT_TIMEOUT=120
SDNEXT_POLL_INTERVAL=2
SDNEXT_DEFAULT_STEPS=20
SDNEXT_DEFAULT_SAMPLER=DPM++ 2M
SDNEXT_DEFAULT_CFG_SCALE=7.0
SDNEXT_OUTPUT_DIR=/app/outputs

# Database Configuration
DATABASE_URL=postgresql+psycopg://postgres:postgres@postgres:5432/lora
REDIS_URL=redis://redis:6379/0

# API Configuration
API_KEY=your-api-key-here

# Import Configuration
IMPORT_PATH=/app/loras
IMPORT_POLL_SECONDS=60
EOF

echo "✅ Environment configuration created"

# Create ROCm-specific environment file
echo "⚙️ Creating ROCm-specific configuration..."

cat > .env.rocm << 'EOF'
# ROCm-specific SDNext + LoRA Backend Configuration

# SDNext Configuration for ROCm
SDNEXT_BASE_URL=http://sdnext:7860
SDNEXT_TIMEOUT=240
SDNEXT_POLL_INTERVAL=2
SDNEXT_DEFAULT_STEPS=20
SDNEXT_DEFAULT_SAMPLER=DPM++ 2M
SDNEXT_DEFAULT_CFG_SCALE=7.0
SDNEXT_OUTPUT_DIR=/app/outputs

# ROCm Performance Tuning
HSA_OVERRIDE_GFX_VERSION=10.3.0
MIOPEN_FIND_MODE=FAST
MIOPEN_USER_DB_PATH=/tmp/.miopen
HIP_VISIBLE_DEVICES=0
ROC_ENABLE_PRE_VEGA=1

# Database Configuration
DATABASE_URL=postgresql+psycopg://postgres:postgres@postgres:5432/lora
REDIS_URL=redis://redis:6379/0

# API Configuration
API_KEY=your-api-key-here

# Import Configuration
IMPORT_PATH=/app/loras
IMPORT_POLL_SECONDS=60
EOF

echo "✅ ROCm configuration created"

# Detect user's GPU architecture for ROCm
if command -v rocm-smi >/dev/null 2>&1; then
    echo "🔍 Detecting AMD GPU architecture for ROCm optimization..."
    GPU_INFO=$(rocm-smi --showproductname --csv 2>/dev/null | tail -n +2 | head -n 1)
    if [[ "$GPU_INFO" == *"RX 7"* ]] || [[ "$GPU_INFO" == *"RDNA3"* ]]; then
        echo "   RDNA3 GPU detected - Setting HSA_OVERRIDE_GFX_VERSION=11.0.0"
        sed -i 's/HSA_OVERRIDE_GFX_VERSION=10.3.0/HSA_OVERRIDE_GFX_VERSION=11.0.0/' .env.rocm
    elif [[ "$GPU_INFO" == *"RX 6"* ]] || [[ "$GPU_INFO" == *"RDNA2"* ]]; then
        echo "   RDNA2 GPU detected - Using HSA_OVERRIDE_GFX_VERSION=10.3.0"
    elif [[ "$GPU_INFO" == *"RX 5"* ]] || [[ "$GPU_INFO" == *"RDNA1"* ]]; then
        echo "   RDNA1 GPU detected - Setting HSA_OVERRIDE_GFX_VERSION=10.1.0"
        sed -i 's/HSA_OVERRIDE_GFX_VERSION=10.3.0/HSA_OVERRIDE_GFX_VERSION=10.1.0/' .env.rocm
    fi
    echo "   For manual tuning, edit HSA_OVERRIDE_GFX_VERSION in .env.rocm"
fi

# Create README for Docker setup
echo "📚 Creating Docker setup documentation..."

cat > DOCKER_SETUP.md << 'EOF'
# SDNext + LoRA Backend Docker Setup

This Docker setup provides a complete environment for running the LoRA Backend with SDNext (Stable Diffusion) integration.

## Quick Start

### GPU Setup (Recommended)
```bash
# Setup directories and configuration
./setup_sdnext_docker.sh

# For NVIDIA GPUs
docker-compose -f docker-compose.gpu.yml up -d

# Check logs
docker-compose -f docker-compose.gpu.yml logs -f sdnext
```

### AMD ROCm Setup (AMD GPUs)
```bash
# Setup directories and configuration
./setup_sdnext_docker.sh

# For AMD GPUs with ROCm
docker-compose -f docker-compose.rocm.yml up -d

# Check logs
docker-compose -f docker-compose.rocm.yml logs -f sdnext
```

**ROCm Requirements:**
- AMD GPU with ROCm support
- ROCm drivers installed on host system
- Docker with device access to /dev/dri and /dev/kfd

**ROCm Performance Tips:**
- Edit `.env.rocm` to set correct `HSA_OVERRIDE_GFX_VERSION` for your GPU
- Use `MIOPEN_FIND_ENFORCE=SEARCH` for best performance (slower startup)
- Use `MIOPEN_FIND_MODE=FAST` for faster startup (slightly worse performance)

### CPU Setup (Testing/Development)
```bash
# Start with CPU-only (slower but works everywhere)
docker-compose -f docker-compose.cpu.yml up -d
```

### Default Setup (Auto-detect)
```bash
# Uses basic configuration (may need GPU setup)
docker-compose up -d
```

## Services

- **API**: http://localhost:8782 - LoRA Backend API
- **SDNext**: http://localhost:7860 - Stable Diffusion WebUI
- **WebSocket**: ws://localhost:8782/ws/progress - Real-time progress monitoring
- **PostgreSQL**: localhost:5433 - Database
- **Redis**: localhost:6380 - Job queue

## Directory Structure

```
├── models/
│   ├── Stable-diffusion/  # Place SD models here
│   ├── Lora/             # LoRA models (shared with backend)
│   ├── VAE/              # VAE models
│   └── ControlNet/       # ControlNet models
├── loras/                # LoRA files with metadata
├── sdnext_config/        # SDNext configuration
└── outputs/              # Generated images
```

## First Run

1. **Download Models**: Place your Stable Diffusion models in `models/Stable-diffusion/`
2. **Add LoRAs**: Place LoRA files in `loras/` directory
3. **Start Services**: Run the appropriate docker-compose command
4. **Wait for SDNext**: First startup takes 2-5 minutes to download dependencies
5. **Test API**: Visit http://localhost:8782/docs for API documentation

## Example API Usage

```bash
# Generate an image
curl -X POST http://localhost:8782/generation/generate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{
    "prompt": "a beautiful landscape",
    "steps": 20,
    "width": 512,
    "height": 512
  }'

# Queue generation job with WebSocket monitoring
curl -X POST http://localhost:8782/generation/queue-generation \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{
    "prompt": "a cute cat",
    "steps": 15
  }'
```

## WebSocket Monitoring

Connect to `ws://localhost:8782/ws/progress` for real-time generation updates:

```javascript
const ws = new WebSocket('ws://localhost:8782/ws/progress');
ws.onopen = () => {
  ws.send(JSON.stringify({type: "subscribe", job_ids: null}));
};
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Progress update:', data);
};
```

## Troubleshooting

### SDNext won't start
- Check GPU drivers: `nvidia-smi`
- Try CPU version: `docker-compose -f docker-compose.cpu.yml up`
- Check logs: `docker-compose logs sdnext`

### API can't connect to SDNext
- Wait for SDNext health check: `docker-compose ps`
- Check SDNext API: `curl http://localhost:7860/sdapi/v1/options`
- Verify network: `docker network ls`

### Out of memory errors
- Reduce image dimensions in requests
- Use CPU version for testing
- Add more swap space

### Permission errors
- Check directory permissions: `ls -la models/ loras/`
- Fix with: `sudo chown -R $USER:$USER models/ loras/ outputs/`

## Performance Tips

### GPU Optimization
- Use `docker-compose.gpu.yml` for best performance
- Ensure NVIDIA Container Toolkit is installed
- Monitor GPU usage: `nvidia-smi`

### CPU Optimization
- Use fewer steps (10-15) for faster generation
- Use simpler samplers (Euler, LMS)
- Reduce image dimensions

## Development

### Hot Reload
The API service includes hot reload for development:
```bash
# Edit files locally, changes auto-reload in container
docker-compose -f docker-compose.gpu.yml up api
```

### Debugging
```bash
# Access container shell
docker-compose exec api bash
docker-compose exec sdnext bash

# View real-time logs
docker-compose logs -f --tail=100 api
docker-compose logs -f --tail=100 sdnext
```

## Production Deployment

For production:
1. Use proper SSL termination
2. Set strong API keys
3. Configure resource limits
4. Use external database/redis
5. Set up monitoring and backups
EOF

echo "✅ Docker setup documentation created"

echo
echo "🎉 Setup complete! Next steps:"
echo
echo "1. Download Stable Diffusion models to models/Stable-diffusion/"
echo "2. Add LoRA files to loras/ directory"  
echo "3. Choose your setup:"
echo "   - GPU: docker-compose -f docker-compose.gpu.yml up -d"
echo "   - CPU: docker-compose -f docker-compose.cpu.yml up -d"
echo "   - Auto: docker-compose up -d"
echo "4. Wait for services to start (check: docker-compose ps)"
echo "5. Test: open http://localhost:8782/docs"
echo
echo "📚 See DOCKER_SETUP.md for detailed instructions"
echo "🔧 Edit .env file to customize configuration"
echo
