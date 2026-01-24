.PHONY: help build up down logs clean restart backend-shell frontend-shell db-shell prisma-studio prisma-migrate dev-up dev-down dev-logs

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build all Docker images
	docker-compose build

up: ## Start all services
	docker-compose up -d
	@echo "✅ Services started!"
	@echo "Frontend: http://localhost"
	@echo "Backend API: http://localhost:3000"
	@echo "PostgreSQL: localhost:5432"

down: ## Stop all services
	docker-compose down

logs: ## Show logs from all services
	docker-compose logs -f

logs-backend: ## Show backend logs
	docker-compose logs -f backend

logs-frontend: ## Show frontend logs
	docker-compose logs -f frontend

logs-db: ## Show database logs
	docker-compose logs -f postgres

clean: ## Remove all containers, volumes, and images
	docker-compose down -v --rmi all
	@echo "✅ Cleaned up all Docker resources"

restart: down up ## Restart all services

backend-shell: ## Open shell in backend container
	docker-compose exec backend sh

frontend-shell: ## Open shell in frontend container
	docker-compose exec frontend sh

db-shell: ## Open PostgreSQL shell
	docker-compose exec postgres psql -U sissibol_user -d sissibol

prisma-studio: ## Open Prisma Studio
	docker-compose exec backend npx prisma studio

prisma-migrate: ## Run Prisma migrations
	docker-compose exec backend npx prisma migrate deploy

prisma-generate: ## Generate Prisma Client
	docker-compose exec backend npx prisma generate

seed-admin: ## Create admin user (email: admin@sissibol.com, password: admin123)
	@echo "Creating admin user..."
	@curl -X POST http://localhost:3000/auth/register \
		-H "Content-Type: application/json" \
		-d '{"email":"admin@sissibol.com","password":"admin123","ruolo":"ADMIN"}' \
		&& echo "\n✅ Admin user created: admin@sissibol.com / admin123" \
		|| echo "\n❌ Failed to create admin user (may already exist)"

status: ## Show status of all services
	docker-compose ps

rebuild: clean build up ## Clean, rebuild and start all services

# Development mode with hot reload
dev-up: ## Start services in development mode with hot reload
	docker-compose -f docker-compose.dev.yml up -d
	@echo "✅ Development services started!"
	@echo "Frontend (hot reload): http://localhost:5173"
	@echo "Backend API (hot reload): http://localhost:3000"
	@echo "PostgreSQL: localhost:5432"

dev-down: ## Stop development services
	docker-compose -f docker-compose.dev.yml down

dev-logs: ## Show logs from development services
	docker-compose -f docker-compose.dev.yml logs -f

dev-rebuild: ## Rebuild and restart development services
	docker-compose -f docker-compose.dev.yml down
	docker-compose -f docker-compose.dev.yml build
	docker-compose -f docker-compose.dev.yml up -d
