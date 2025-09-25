# ROCm Troubleshooting Guide

This guide provides solutions for common issues encountered when running the LoRA Manager with an AMD GPU using ROCm and Docker.

## 1. Prerequisites Check

Before troubleshooting, ensure your system is correctly set up.

### 1.1. Verify ROCm Installation on Host

Run these commands on your host machine (not in Docker) to confirm that ROCm is installed and can detect your GPU.

```bash
# 1. Check ROCm version
rocm-smi --version

# 2. Check if your GPU is detected
rocm-smi --showproductname

# 3. Verify device file permissions
ls -la /dev/dri /dev/kfd
```

You should see your GPU name (e.g., `card0: Navi 21`) and have read/write permissions for the `render` and `video` groups on the device files. If not, add your user to the correct groups:

```bash
sudo usermod -a -G render,video $USER
# Log out and log back in for the changes to take effect.
```

### 1.2. Verify Docker Access to GPU

Confirm that Docker can access the GPU devices.

```bash
docker run --rm --device /dev/dri --device /dev/kfd rocm/rocm-runtime rocm-smi
```

This command should successfully execute `rocm-smi` from within a container, indicating that Docker has the necessary permissions.

---

## 2. Common Issues and Solutions

### Issue: GPU Not Detected in Container

-   **Symptom**: The application starts but runs on the CPU. Logs may show messages like "No GPU found."
-   **Solution**: The most common cause is an incorrect `HSA_OVERRIDE_GFX_VERSION` for your GPU architecture.

    1.  **Identify your GPU Architecture**:
        Use `rocm-smi --showproductname` to identify your GPU. Match it to the correct architecture version.

| GPU Series | Architecture | `HSA_OVERRIDE_GFX_VERSION` |
| :--- | :--- | :--- |
| RX 7000 Series | RDNA3 | `11.0.0` |
| RX 6000 Series | RDNA2 | `10.3.0` |
| RX 5000 Series | RDNA1 | `10.1.0` |

    2.  **Set the Environment Variable**:
        In your `.env` file (or `docker-compose.override.yml`), set the correct `HSA_OVERRIDE_GFX_VERSION`.

        ```env
        # .env - Example for an RX 6800 XT (RDNA2)
        HSA_OVERRIDE_GFX_VERSION=10.3.0
        ```

### Issue: Slow Startup or High VRAM Usage at Idle

-   **Symptom**: The container takes a very long time to start, or you notice high VRAM usage even when not generating images.
-   **Solution**: Adjust the MIOpen find mode.

    -   **For Faster Startup**: Use `MIOPEN_FIND_MODE=FAST`. This reduces startup time at the cost of slightly lower performance during generation.
    -   **For Best Performance**: Use `MIOPEN_FIND_ENFORCE=SEARCH`. This will take longer to start the first time as it tunes for your specific models, but will yield better performance.

    Set this in your `.env` file:
    ```env
    # .env
    MIOPEN_FIND_MODE=FAST
    ```

### Issue: Docker Container Fails to Start or Exits Immediately

-   **Symptom**: `docker-compose up` fails, and the `sdnext` or `backend` container exits with an error.
-   **Solution**: Check the container logs and device permissions.

    1.  **Check Logs**:
        ```bash
        docker compose --env-file .env.docker \
          -f infrastructure/docker/docker-compose.dev.yml \
          -f infrastructure/docker/docker-compose.rocm.override.yml \
          --profile sdnext logs sdnext
        ```
        Look for errors related to device access or missing libraries.

    2.  **Fix Device Permissions**:
        Sometimes host permissions for the Docker devices are incorrect.
        ```bash
        sudo chmod 666 /dev/dri/render* /dev/kfd
        ```

    3.  **Recreate Container**:
        If you've made changes, force Docker to recreate the container.
        ```bash
        docker compose --env-file .env.docker \
          -f infrastructure/docker/docker-compose.dev.yml \
          -f infrastructure/docker/docker-compose.rocm.override.yml \
          --profile sdnext up -d --force-recreate
        ```

### Issue: Poor Performance During Generation

-   **Symptom**: Image generation is much slower than expected.
-   **Solution**: Ensure you are using optimized settings.

    1.  **Use the ROCm override**: Ensure you're layering `docker-compose.rocm.override.yml` (or invoking `make docker-dev-up-rocm`) so the ROCm-specific devices and environment variables are applied.
    2.  **Monitor GPU Usage**: While generating an image, run `rocm-smi` on the host to see if the GPU is being utilized. If GPU usage is low, it may indicate a bottleneck elsewhere.
    3.  **Check Temperatures**: High temperatures can cause thermal throttling.
        ```bash
        rocm-smi --showtemp
        ```

---

## 3. Useful Commands

-   **Monitor GPU in real-time**:
    ```bash
    watch -n 1 rocm-smi
    ```
-   **Clear MIOpen cache** (if you suspect corrupted cache files):
    ```bash
    rm -rf ~/.miopen/
    ```
-   **View live container logs**:
    ```bash
    docker-compose logs -f --tail=100 backend
    ```
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
docker compose --env-file .env.docker \
  -f infrastructure/docker/docker-compose.dev.yml \
  -f infrastructure/docker/docker-compose.rocm.override.yml \
  --profile sdnext logs -f sdnext | grep -i rocm
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
