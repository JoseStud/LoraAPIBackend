COMPOSE ?= docker compose
COMPOSE_FILE ?= docker-compose.dev.yml
ENV_FILE := $(if $(wildcard .env.docker),.env.docker,.env.docker.example)

.PHONY: dev dev-ml dev-down dev-clean dev-logs deps-lock

dev:
	@echo "Using $(ENV_FILE) for environment configuration"
	$(COMPOSE) --env-file $(ENV_FILE) -f $(COMPOSE_FILE) up --build

dev-ml:
	@echo "Using $(ENV_FILE) for environment configuration"
	$(COMPOSE) --env-file $(ENV_FILE) -f $(COMPOSE_FILE) --profile ml up --build

dev-down:
	$(COMPOSE) --env-file $(ENV_FILE) -f $(COMPOSE_FILE) down

dev-clean:
	$(COMPOSE) --env-file $(ENV_FILE) -f $(COMPOSE_FILE) down -v

dev-logs:
	$(COMPOSE) --env-file $(ENV_FILE) -f $(COMPOSE_FILE) logs -f

# Regenerate the pinned Python requirements from requirements.in / dev-requirements.in.
# Requires uv (https://docs.astral.sh/uv/): `pip install uv`.
PYTHON_LOCK_VERSION ?= 3.11

.PHONY: demo demo-check demo-down demo-reset
demo:
	sh scripts/demo.sh up
demo-check:
	sh scripts/demo.sh check
demo-down:
	sh scripts/demo.sh down
demo-reset:
	sh scripts/demo.sh reset

deps-lock:
	uv pip compile requirements.in -o requirements.txt --python-version $(PYTHON_LOCK_VERSION) --custom-compile-command "make deps-lock"
	uv pip compile dev-requirements.in -o dev-requirements.txt --python-version $(PYTHON_LOCK_VERSION) --custom-compile-command "make deps-lock"
