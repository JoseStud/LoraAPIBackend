COMPOSE ?= docker compose
COMPOSE_FILE ?= docker-compose.dev.yml
ENV_FILE := $(if $(wildcard .env.docker),.env.docker,.env.docker.example)

.PHONY: dev dev-ml dev-down dev-clean dev-logs

dev:
@echo "Using $${ENV_FILE} for environment configuration"
$(COMPOSE) --env-file $(ENV_FILE) -f $(COMPOSE_FILE) up --build

dev-ml:
@echo "Using $${ENV_FILE} for environment configuration"
$(COMPOSE) --env-file $(ENV_FILE) -f $(COMPOSE_FILE) --profile ml up --build

dev-down:
$(COMPOSE) --env-file $(ENV_FILE) -f $(COMPOSE_FILE) down

dev-clean:
$(COMPOSE) --env-file $(ENV_FILE) -f $(COMPOSE_FILE) down -v

dev-logs:
$(COMPOSE) --env-file $(ENV_FILE) -f $(COMPOSE_FILE) logs -f
