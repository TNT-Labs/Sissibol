.PHONY: help build up down logs clean restart backend-shell frontend-shell db-shell prisma-studio prisma-migrate dev-up dev-down dev-logs backup backup-stato ripristina admin-password

# File compose da usare: in produzione COMPOSE=docker-compose.https.yml
COMPOSE ?= docker-compose.yml
DC = docker compose -f $(COMPOSE)

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build all Docker images
	$(DC) build

up: ## Start all services
	$(DC) up -d
	@echo "✅ Services started!"
	@echo "Frontend: http://localhost"
	@echo "Backend API: http://localhost:3000"
	@echo "PostgreSQL: localhost:5432"

down: ## Stop all services
	$(DC) down

logs: ## Show logs from all services
	$(DC) logs -f

logs-backend: ## Show backend logs
	$(DC) logs -f backend

logs-frontend: ## Show frontend logs
	$(DC) logs -f frontend

logs-db: ## Show database logs
	$(DC) logs -f postgres

clean: ## Remove containers, images AND THE DATABASE (asks for confirmation)
	@printf "Elimina container, immagini e il DATABASE. Scrivere ELIMINA per confermare: "; \
	read conferma; [ "$$conferma" = "ELIMINA" ] || { echo "Annullato."; exit 1; }
	$(DC) down -v --rmi all
	@echo "✅ Cleaned up all Docker resources"

restart: down up ## Restart all services

backend-shell: ## Open shell in backend container
	$(DC) exec backend sh

frontend-shell: ## Open shell in frontend container
	$(DC) exec frontend sh

db-shell: ## Open PostgreSQL shell
	$(DC) exec postgres psql -U sissibol_user -d sissibol

prisma-studio: ## Open Prisma Studio
	$(DC) exec backend npx prisma studio

prisma-migrate: ## Run Prisma migrations
	$(DC) exec backend npx prisma migrate deploy

prisma-generate: ## Generate Prisma Client
	$(DC) exec backend npx prisma generate

backup: ## Esegue subito un backup del database e delle ricevute
	$(DC) exec backup sh /script/backup.sh esegui

backup-stato: ## Mostra lo stato dell'ultimo backup
	$(DC) exec backup cat /backups/stato.json

ripristina: ## Ripristina un backup: make ripristina FILE=sissibol-AAAAMMGG-HHMMSS.dump
	@[ -n "$(FILE)" ] || { echo "Indicare FILE=nome.dump (vedi la cartella backups/)"; exit 1; }
	./scripts/backup/ripristina.sh $(FILE) $(COMPOSE)

admin-password: ## Mostra la password iniziale generata per l'amministratore
	@riga=$$($(DC) logs backend 2>/dev/null | grep "Password iniziale generata" | tail -n 1); \
	if [ -n "$$riga" ]; then echo "$$riga"; else echo "Nessuna password generata nei log (impostata con ADMIN_PASSWORD_INIZIALE, oppure amministratore già esistente)"; fi

status: ## Show status of all services
	$(DC) ps

rebuild: ## Rebuild images and restart (database and backups untouched)
	$(DC) up -d --build

# Development mode with hot reload
dev-up: ## Start services in development mode with hot reload
	docker compose -f docker-compose.dev.yml up -d
	@echo "✅ Development services started!"
	@echo "Frontend (hot reload): http://localhost:5173"
	@echo "Backend API (hot reload): http://localhost:3000"
	@echo "PostgreSQL: localhost:5432"

dev-down: ## Stop development services
	docker compose -f docker-compose.dev.yml down

dev-logs: ## Show logs from development services
	docker compose -f docker-compose.dev.yml logs -f

dev-rebuild: ## Rebuild and restart development services
	docker compose -f docker-compose.dev.yml down
	docker compose -f docker-compose.dev.yml build
	docker compose -f docker-compose.dev.yml up -d
