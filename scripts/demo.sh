#!/bin/sh
# Only controls the isolated lora-demo Compose project. No private env files.
set -eu
cd "$(dirname "$0")/.."
compose() {
    docker compose --env-file /dev/null -p lora-demo -f docker-compose.dev.yml --profile demo "$@"
}
run_check() {
    compose exec -T demo-api python -m scripts.demo.smoke "$@"
}
start() {
    compose up --build -d --wait --wait-timeout 180 demo-api demo-worker sdnext-simulator
    echo 'LoRA demo: http://127.0.0.1:18000/api/docs (API key: demo-token)'
    echo 'Uses a simulated SDNext service and fixed test PNG; no AI inference.'
}
case "${1:-up}" in
    up) start ;;
    check)
        # Integration checks must never send test jobs to a real inference server.
        export DEMO_SDNEXT_BASE_URL=http://sdnext-simulator:7860
        export DEMO_SDNEXT_TIMEOUT=3
        start
        restore() {
            compose start demo-worker >/dev/null 2>&1 || true
            run_check restore >/dev/null 2>&1 || true
        }
        trap restore EXIT
        compose exec -T demo-api alembic check
        compose stop demo-worker
        run_check queued
        compose start demo-worker
        run_check completed
        compose restart demo-api
        run_check persisted
        run_check failures
        echo 'PASS: queue, worker, HTTP integration, storage, restart and failures.'
        ;;
    down) compose down ;;
    reset)
        echo 'Removing only containers and volumes belonging to lora-demo.'
        compose down --volumes
        ;;
    logs) compose logs --no-color demo-api demo-worker sdnext-simulator ;;
    *) echo 'Usage: sh scripts/demo.sh up|check|down|reset|logs' >&2; exit 2 ;;
esac
