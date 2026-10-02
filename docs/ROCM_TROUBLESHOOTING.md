# ROCm Troubleshooting Guide

This guide provides solutions for common issues encountered when running the LoRA Manager with an AMD GPU using ROCm.

SDNext runs directly on the host (not in Docker) so it can use the native ROCm install; the LoRA Manager containers connect to it over HTTP. See [External SDNext](CUSTOM_SETUP.md#external-sdnext-recommended-for-gpu) for the setup. All ROCm settings below apply to the host SDNext process.

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

### 1.2. Verify the Containers Can Reach SDNext

Start SDNext with `--listen`, then confirm the API container can reach it:

```bash
curl -s http://localhost:7860/sdapi/v1/options >/dev/null && echo "host OK"
docker compose -f docker-compose.dev.yml exec api \
  python -c "import urllib.request; urllib.request.urlopen('http://host.docker.internal:7860/sdapi/v1/options'); print('container OK')"
```

If the host check passes but the container check fails, SDNext is probably bound to `127.0.0.1` only (missing `--listen`) or a firewall is blocking the Docker bridge.

---

## 2. Common Issues and Solutions

### Issue: GPU Not Detected in Container

-   **Symptom**: SDNext starts but runs on the CPU. Its console may show messages like "No GPU found."
-   **Solution**: The most common cause is an incorrect `HSA_OVERRIDE_GFX_VERSION` for your GPU architecture.

    1.  **Identify your GPU Architecture**:
        Use `rocm-smi --showproductname` to identify your GPU. Match it to the correct architecture version.

| GPU Series | Architecture | `HSA_OVERRIDE_GFX_VERSION` |
| :--- | :--- | :--- |
| RX 7000 Series | RDNA3 | `11.0.0` |
| RX 6000 Series | RDNA2 | `10.3.0` |
| RX 5000 Series | RDNA1 | `10.1.0` |

    2.  **Set the Environment Variable**:
        Export the correct `HSA_OVERRIDE_GFX_VERSION` in the shell (or SDNext's `webui-user.sh`) before launching SDNext.

        ```bash
        # Example for an RX 6800 XT (RDNA2)
        HSA_OVERRIDE_GFX_VERSION=10.3.0 ./webui.sh --listen --use-rocm
        ```

### Issue: Slow Startup or High VRAM Usage at Idle

-   **Symptom**: SDNext takes a very long time to start, or you notice high VRAM usage even when not generating images.
-   **Solution**: Adjust the MIOpen find mode.

    -   **For Faster Startup**: Use `MIOPEN_FIND_MODE=FAST`. This reduces startup time at the cost of slightly lower performance during generation.
    -   **For Best Performance**: Use `MIOPEN_FIND_ENFORCE=SEARCH`. This will take longer to start the first time as it tunes for your specific models, but will yield better performance.

    Set this in the environment SDNext is launched from:
    ```bash
    export MIOPEN_FIND_MODE=FAST
    ```

### Issue: SDNext Fails to Start or Exits Immediately

-   **Symptom**: SDNext exits during startup with a ROCm or device error.
-   **Solution**: Check the SDNext console output and device permissions.

    1.  **Check Logs**:
        Run SDNext in the foreground (`./webui.sh --listen --use-rocm --debug`) and look for errors related to device access or missing libraries.

    2.  **Fix Device Permissions**:
        Make sure your user can access the GPU devices (see section 1.1). As a temporary workaround:
        ```bash
        sudo chmod 666 /dev/dri/render* /dev/kfd
        ```

### Issue: Poor Performance During Generation

-   **Symptom**: Image generation is much slower than expected.
-   **Solution**: Ensure you are using optimized settings.

    1.  **Check the SDNext backend**: Confirm SDNext was launched with `--use-rocm` and reports a ROCm/HIP device at startup rather than falling back to CPU.
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
# Check SDNext startup output for ROCm initialization
./webui.sh --listen --use-rocm 2>&1 | grep -i rocm
```

### 3. Performance Benchmark
```bash
# Use the WebSocket test client to monitor generation times
python examples/websocket_client_example.py --host localhost --port 8000
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
