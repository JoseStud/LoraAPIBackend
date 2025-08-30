# ROCm Troubleshooting Guide for SDNext Integration

## Prerequisites Check

### 1. Verify ROCm Installation
```bash
# Check if ROCm is installed
rocm-smi --version

# Check GPU detection
rocm-smi --showproductname

# Check device access
ls -la /dev/dri /dev/kfd
```

### 2. Check Docker Device Access
```bash
# Test Docker can access GPU devices
docker run --rm --device /dev/dri --device /dev/kfd rocm/rocm-runtime rocm-smi
```

## Common Issues and Solutions

### Issue 1: GPU Not Detected
**Symptoms:** SDNext starts but uses CPU, no GPU acceleration

**Solutions:**
1. Verify GPU architecture in `.env.rocm`:
```bash
# Check your GPU architecture
rocm-smi --showproductname

# Update HSA_OVERRIDE_GFX_VERSION in .env.rocm:
# RDNA1 (RX 5000): HSA_OVERRIDE_GFX_VERSION=10.1.0  
# RDNA2 (RX 6000): HSA_OVERRIDE_GFX_VERSION=10.3.0
# RDNA3 (RX 7000): HSA_OVERRIDE_GFX_VERSION=11.0.0
```

2. Check device permissions:
```bash
sudo usermod -a -G render,video $USER
# Logout and login again
```

### Issue 2: Slow Startup or High VRAM Usage
**Symptoms:** SDNext takes very long to start or uses excessive VRAM

**Solutions:**
1. For faster startup (trade-off: slightly worse performance):
```bash
# In .env.rocm, use:
MIOPEN_FIND_MODE=FAST
```

2. For best performance (trade-off: slower first-time startup):
```bash
# In .env.rocm, use:
MIOPEN_FIND_ENFORCE=SEARCH
```

3. To reduce VRAM usage, in SDNext WebUI settings:
   - Set Device precision type to `fp16`
   - Disable VAE upcasting

### Issue 3: Docker Container Fails to Start
**Symptoms:** SDNext container exits with errors

**Check logs:**
```bash
docker-compose -f docker-compose.rocm.yml logs sdnext
```

**Common fixes:**
1. Ensure devices are accessible:
```bash
# Check device ownership
ls -la /dev/dri /dev/kfd

# Fix permissions if needed
sudo chmod a+rw /dev/dri/render* /dev/kfd
```

2. Update Docker image:
```bash
docker pull disty0/sdnext-rocm:latest
docker-compose -f docker-compose.rocm.yml up --force-recreate
```

### Issue 4: Performance Issues
**Symptoms:** Generation is slower than expected

**Optimizations:**
1. Enable CK Flash Attention (RDNA3 only):
   - In SDNext WebUI: Settings > Compute Settings > Cross Attention
   - Toggle "CK Flash attention" and restart

2. Check temperature throttling:
```bash
rocm-smi --showtemp
```

3. Use optimal settings in SDNext:
   - Sampler: DPM++ 2M, DPM++ SDE Karras
   - Steps: 20-30 for most cases
   - CFG Scale: 7-8

## GPU Architecture Reference

| GPU Series | Architecture | HSA_OVERRIDE_GFX_VERSION |
|------------|--------------|--------------------------|
| RX 5000 series | RDNA1 | 10.1.0 |
| RX 6000 series | RDNA2 | 10.3.0 |
| RX 7000 series | RDNA3 | 11.0.0 |
| Vega series | GCN5 | 9.0.0 |
| Polaris series | GCN4 | 8.0.3 |

## Testing ROCm Setup

### 1. Quick GPU Test
```bash
# Test Docker GPU access
docker run --rm --device /dev/dri --device /dev/kfd \
  rocm/pytorch:latest python -c "import torch; print(torch.cuda.is_available())"
```

### 2. SDNext Specific Test
```bash
# Check SDNext container logs for ROCm initialization
docker-compose -f docker-compose.rocm.yml logs -f sdnext | grep -i rocm
```

### 3. Performance Benchmark
```bash
# Use the WebSocket test client to monitor generation times
python websocket_client_example.py --host localhost --port 8782
```

## Useful Commands

```bash
# Monitor GPU usage during generation
watch -n 1 rocm-smi

# Check ROCm runtime version
cat /opt/rocm/include/hip/hip_version.h | grep HIP_VERSION_MAJOR

# Check MIOpen database
ls -la ~/.miopen/

# Clear MIOpen cache (if having issues)
rm -rf ~/.miopen/
```

## Resources

- [Official ROCm Documentation](https://rocmdocs.amd.com/)
- [SDNext ROCm Wiki](https://github.com/vladmandic/sdnext/wiki/AMD-ROCm)
- [ROCm Installation Guide](https://github.com/vladmandic/sdnext/wiki/AMD-ROCm#rocm-on-linux)
- [ROCm Docker Hub](https://hub.docker.com/u/rocm)

---

**Need more help?** Check the SDNext GitHub issues or create a new issue with your specific configuration and error logs.
