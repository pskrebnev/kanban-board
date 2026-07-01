# Short commands for the Kanban Ticketing stack.
#
# All targets are thin wrappers around Compose so no host runtime beyond a
# container engine is required. By default they use `docker compose`; Podman
# users can override the tool once, e.g.:
#
#   make up      COMPOSE="podman-compose"
#   make seed    COMPOSE="podman-compose"
#   make verify  COMPOSE="podman-compose"
#
# (The repository-root compose.yaml works with either engine.)

COMPOSE      ?= docker compose
SEED_FILES   := -f compose.yaml -f compose.seed.yaml
GENERATED    := ./backend/seed/generated-data.json

.PHONY: up seed verify down help

## up: build and start the whole stack with NO application data (clean, schema-only DB)
up:
	$(COMPOSE) up --build

## seed: build and start the whole stack with the GENERATED demo dataset (ephemeral, in-RAM DB)
seed:
	SEED_FILE_HOST=$(GENERATED) $(COMPOSE) $(SEED_FILES) up --build

## verify: build + start with GENERATED data, run the full e2e suite, and exit with its result
verify:
	SEED_FILE_HOST=$(GENERATED) $(COMPOSE) $(SEED_FILES) --profile test up --build \
		--abort-on-container-exit --exit-code-from e2e e2e

## down: stop the stack and remove its volumes
down:
	$(COMPOSE) down -v

## help: list the available commands
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## //'
