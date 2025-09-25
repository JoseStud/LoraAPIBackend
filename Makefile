COMPOSE_FILE := infrastructure/docker/docker-compose.dev.yml
DOCKER_ENV ?= .env.docker
EXTRA_COMPOSE ?=

ROCM_COMPOSE_FILE := infrastructure/docker/docker-compose.rocm.override.yml

COMPOSE_FILES := -f $(COMPOSE_FILE) $(foreach file,$(EXTRA_COMPOSE),-f $(file))
COMPOSE_BASE := docker compose --env-file $(DOCKER_ENV) $(COMPOSE_FILES)

.PHONY: docker-dev-up docker-dev-up-sdnext docker-dev-up-rocm \
	docker-dev-down docker-dev-down-rocm docker-dev-rebuild \
	docker-dev-logs docker-dev-logs-rocm docker-dev-stop docker-dev-ps docker-dev-shell

docker-dev-up:
	@$(COMPOSE_BASE) up -d

docker-dev-up-sdnext:
	@$(COMPOSE_BASE) --profile sdnext up -d

docker-dev-up-rocm:
	@$(MAKE) EXTRA_COMPOSE=$(ROCM_COMPOSE_FILE) docker-dev-up-sdnext

docker-dev-rebuild:
	@$(COMPOSE_BASE) up --build

docker-dev-down docker-dev-stop:
	@$(COMPOSE_BASE) down

docker-dev-down-rocm:
	@$(MAKE) EXTRA_COMPOSE=$(ROCM_COMPOSE_FILE) docker-dev-down

docker-dev-logs:
	@$(COMPOSE_BASE) logs -f

docker-dev-logs-rocm:
	@$(MAKE) EXTRA_COMPOSE=$(ROCM_COMPOSE_FILE) docker-dev-logs

docker-dev-ps:
	@$(COMPOSE_BASE) ps

docker-dev-shell:
	@$(COMPOSE_BASE) exec api /bin/bash
