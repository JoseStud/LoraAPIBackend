#!/bin/bash

# Customized setup script for SDNext + LoRA Backend Docker integration
# Configured for anxilinux's specific DeepVault environment

set -e

echo "🚀 Setting up SDNext + LoRA Backend with Your Custom Configuration"
echo

# Create basic directories (will be mapped to your existing DeepVault structure)
echo "📁 Creating basic directory structure..."
mkdir -p sdnext_config
mkdir -p outputs
mkdir -p logs

echo "✅ Basic directories created"

# Create your exact SDNext configuration
echo "⚙️ Creating your custom SDNext configuration..."

cat > sdnext_config/config.json << 'EOF'
{
  "diffusers_version": "4fcd0bc7ebb934a1559d0b516f09534ba22c8a0d",
  "ckpt_dir": "/app/models/Stable-diffusion",
  "diffusers_dir": "/app/models/Diffusers",
  "hfcache_dir": "/app/models/huggingface",
  "vae_dir": "/app/models/VAE",
  "unet_dir": "/app/models/UNET",
  "te_dir": "/app/models/Text-encoder",
  "lora_dir": "/app/models/Lora",
  "tunable_dir": "/app/models/tunable",
  "embeddings_dir": "/app/models/embeddings",
  "onnx_temp_dir": "/app/models/ONNX/temp",
  "styles_dir": "/app/models/styles",
  "yolo_dir": "/app/models/yolo",
  "wildcards_dir": "/app/models/wildcards",
  "sdnq_quantize_weights": [
    "Model",
    "TE",
    "LLM"
  ],
  "sd_vae": "sdxl_vae.safetensors",
  "cuda_dtype": "FP16",
  "torch_gc_threshold": 72,
  "sd_model_checkpoint": "novaAnimeXL_ilV100 [7ce4d60ef4]",
  "sd_checkpoint_hash": "7ce4d60ef4e86c9595a1bc7dd9af8f9fd47f2d096698445dfeebecf9e3a0eca1",
  "cuda_compile_backend": "none",
  "sdnq_quantize_with_gpu": false,
  "show_progress_every_n_steps": 0,
  "sdp_options": [
    "Flash attention",
    "Memory attention",
    "Math attention",
    "Dynamic attention",
    "Sage attention"
  ],
  "clip_skip_enabled": true,
  "diffusers_vae_tile_size": 512,
  "diffusers_vae_upcast": "false",
  "diffusers_offload_max_gpu_memory": 0.75,
  "tac_modelKeywordCompletion": "Always",
  "tac_modelKeywordLocation": "Before LORA/LyCO",
  "extra_network_reference_enable": false,
  "gradio_theme": "Default",
  "huggingface_token": "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",
  "lora_apply_tags": 4,
  "theme_type": "Modern",
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
  "keyedit_precision_extra": 0.05
}
EOF

echo "✅ Custom SDNext configuration created"

# Create environment configuration
echo "📝 Creating environment configuration..."

cat > .env.custom << 'EOF'
# Custom LoRA Backend + SDNext Configuration for DeepVault Environment

# SDNext Configuration
SDNEXT_BASE_URL=http://sdnext:7860
SDNEXT_TIMEOUT=180
SDNEXT_POLL_INTERVAL=2
SDNEXT_DEFAULT_STEPS=20
SDNEXT_DEFAULT_SAMPLER=DPM++ 2M
SDNEXT_DEFAULT_CFG_SCALE=7.0
SDNEXT_OUTPUT_DIR=/app/outputs

# Your Model Configuration
SDNEXT_DEFAULT_MODEL=novaAnimeXL_ilV100
SDNEXT_DEFAULT_VAE=sdxl_vae.safetensors
SDNEXT_DEFAULT_PRECISION=FP16

# Database Configuration
DATABASE_URL=postgresql+psycopg://postgres:postgres@postgres:5432/lora
REDIS_URL=redis://redis:6379/0

# API Configuration
API_KEY=your-api-key-here

# Directory Configuration (mapped to your DeepVault structure)
LORA_DIRECTORY=/app/loras
MODELS_DIRECTORY=/app/models
OUTPUT_DIRECTORY=/app/outputs

# Hugging Face Token
HF_TOKEN=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
EOF

echo "✅ Environment configuration created (.env.custom)"

# Create ROCm-specific environment
echo "⚙️ Creating ROCm configuration for your setup..."

cat > .env.rocm.custom << 'EOF'
# ROCm Configuration for DeepVault + AMD GPU

# SDNext Configuration
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

# Your Model Configuration
SDNEXT_DEFAULT_MODEL=novaAnimeXL_ilV100
SDNEXT_DEFAULT_VAE=sdxl_vae.safetensors
SDNEXT_DEFAULT_PRECISION=FP16

# Database Configuration
DATABASE_URL=postgresql+psycopg://postgres:postgres@postgres:5432/lora
REDIS_URL=redis://redis:6379/0

# API Configuration
API_KEY=your-api-key-here

# Directory Configuration
LORA_DIRECTORY=/app/loras
MODELS_DIRECTORY=/app/models
OUTPUT_DIRECTORY=/app/outputs

# Hugging Face Token
HF_TOKEN=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
EOF

echo "✅ ROCm configuration created (.env.rocm.custom)"

# Hardware detection with your setup
echo "🔍 Detecting hardware for your configuration..."

if command -v rocm-smi >/dev/null 2>&1 && rocm-smi >/dev/null 2>&1; then
    echo "✅ AMD GPU with ROCm detected"
    echo "   Your GPU architecture detected..."
    GPU_INFO=$(rocm-smi --showproductname --csv 2>/dev/null | tail -n +2 | head -n 1)
    if [[ "$GPU_INFO" == *"RX 7"* ]] || [[ "$GPU_INFO" == *"RDNA3"* ]]; then
        echo "   RDNA3 GPU - Setting HSA_OVERRIDE_GFX_VERSION=11.0.0"
        sed -i 's/HSA_OVERRIDE_GFX_VERSION=10.3.0/HSA_OVERRIDE_GFX_VERSION=11.0.0/' .env.rocm.custom
    elif [[ "$GPU_INFO" == *"RX 6"* ]] || [[ "$GPU_INFO" == *"RDNA2"* ]]; then
        echo "   RDNA2 GPU - Using HSA_OVERRIDE_GFX_VERSION=10.3.0 (default)"
    elif [[ "$GPU_INFO" == *"RX 5"* ]] || [[ "$GPU_INFO" == *"RDNA1"* ]]; then
        echo "   RDNA1 GPU - Setting HSA_OVERRIDE_GFX_VERSION=10.1.0"
        sed -i 's/HSA_OVERRIDE_GFX_VERSION=10.3.0/HSA_OVERRIDE_GFX_VERSION=10.1.0/' .env.rocm.custom
    fi
    echo "   🚀 Recommended: make docker-dev-up-rocm"
elif command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
    echo "✅ NVIDIA GPU detected"
    echo "   🚀 Recommended: docker compose -f infrastructure/docker/docker-compose.gpu.yml up -d"
else
    echo "💻 No GPU detected, using CPU mode"
    echo "   🚀 Recommended: docker compose -f infrastructure/docker/docker-compose.cpu.yml up -d"
fi

echo
echo "🎯 Configuration Summary:"
echo "   • Model: novaAnimeXL_ilV100"
echo "   • VAE: sdxl_vae.safetensors"
echo "   • Precision: FP16"
echo "   • Theme: Modern"
echo "   • LoRA Directory: /home/anxilinux/DeepVault/models/Lora"
echo "   • Model Directory: /home/anxilinux/DeepVault/models/"
echo "   • Hugging Face Token: Configured"
echo

echo "🚀 Setup complete! Your configuration files:"
echo "   • sdnext_config/config.json - Your exact SDNext settings"
echo "   • .env.custom - Standard environment configuration"
echo "   • .env.rocm.custom - ROCm-optimized configuration"
echo

echo "🔧 Next steps:"
echo "   1. Start services: make docker-dev-up-rocm"
echo "   2. Check health: ./check_health.sh"
echo "   3. Test generation: open websocket_test_client.html"
echo

echo "✅ Ready to generate images with your DeepVault setup!"
