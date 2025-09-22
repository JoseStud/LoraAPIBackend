# Implementation status: SDNext integration & Docker setup

The SDNext work landed in this repository is functional but not feature-complete.
This note replaces the previous "implementation complete" announcement so new
contributors have an honest picture of what exists and what still needs work.

## Current capabilities

* **SDNext client wrapper** – The `sdnext` generation backend can issue txt2img
  requests, save optional image files, and report simple progress data. It is
  driven by the configuration values exposed in `backend.core.config` and only
  supports servers that implement the standard SDNext HTTP API.【F:backend/delivery/sdnext.py†L15-L205】
* **Generation endpoints** – `/v1/generation` routes cover immediate requests,
  queue-backed jobs, and prompt+generate helpers. Deferred jobs reuse the
  delivery queue and broadcast updates through the shared WebSocket service.【F:backend/api/v1/generation.py†L1-L373】
* **WebSocket bridge** – `/api/v1/ws/progress` delegates to
  `WebSocketService.handle_connection`, allowing clients to subscribe to job
  updates created by the generation and delivery services.【F:backend/api/v1/websocket.py†L1-L43】
* **Container templates** – `infrastructure/docker` contains docker-compose
  variants for CPU, NVIDIA, and AMD ROCm, plus a health-check helper and the
  SDNext build context. The `infrastructure/scripts/setup_sdnext_docker.sh`
  script automates pulling these images together for local testing.【F:infrastructure/docker/README.md†L1-L140】【F:infrastructure/scripts/setup_sdnext_docker.sh†L1-L180】

## What still needs work

* **Limited API surface** – Only the txt2img flow is wired; img2img, extras,
  ControlNet, and other SDNext APIs mentioned in earlier docs are not exposed in
  the backend yet.【F:backend/delivery/sdnext.py†L61-L111】
* **Queue processing expectations** – Redis/RQ support exists, but without a
  dedicated worker process long-running jobs fall back to FastAPI background
  tasks. Production deployments should ship an RQ worker and improved retry
  handling.【F:backend/services/queue.py†L19-L91】【F:backend/services/deliveries.py†L68-L170】
* **Observability & auth** – Generation endpoints rely on the global logging
  configuration and do not integrate authentication or rate limiting. API-key
  support remains opt-in via settings and is not enforced in the routers.【F:backend/api/v1/generation.py†L56-L223】
* **Testing coverage** – There is backend test scaffolding, but end-to-end
  coverage for the SDNext workflow depends on optional services and is still
  spotty. Expect to run SDNext manually when validating changes.【F:tests/test_generation_jobs.py†L1-L200】
* **Artifact management** – Generated images are saved to disk when
  `save_images=True`. Publishing URLs, cleaning old artifacts, and integrating
  with remote storage remain open tasks.【F:backend/delivery/sdnext.py†L129-L205】

## Suggested follow-up tasks

1. Extend `SDNextGenerationBackend` to support img2img, extras, and ControlNet
   routes plus richer error handling and retries.【F:backend/delivery/sdnext.py†L61-L187】
2. Harden the queue pipeline by provisioning an RQ worker container, adding
   retry/backoff logic, and persisting more structured error data.【F:backend/services/deliveries.py†L142-L205】
3. Document how to supply the required ML models so the recommendation and
   generation stacks work out of the box in Docker deployments.【F:backend/services/recommendations/service.py†L33-L118】
4. Add authentication and rate-limiting guidance to the deployment docs so the
  API can be safely exposed outside a trusted network.【F:backend/api/v1/system.py†L1-L16】
5. Capture test recipes for exercising SDNext via docker-compose so contributors
   can validate changes without manual server setup.【F:infrastructure/docker/README.md†L1-L140】

The headline: SDNext support is running, but expect to invest additional effort
before treating the stack as production-ready.
