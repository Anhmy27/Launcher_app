# Database connection string
DB_URL=postgres://launcher:launcher123@localhost:5432/launcher_app?sslmode=disable

.PHONY: help migrate-up migrate-down migrate-status migrate-create migrate-force docker-up docker-down run

help: ## Show this help
	@echo "Available commands:"
	@echo "  make docker-up      - Start PostgreSQL with Docker Compose"
	@echo "  make docker-down    - Stop PostgreSQL"
	@echo "  make migrate-up     - Run all migrations"
	@echo "  make migrate-down   - Rollback last migration"
	@echo "  make migrate-status - Check migration version"
	@echo "  make migrate-create - Create new migration (name=migration_name)"
	@echo "  make run            - Run the server"

docker-up: ## Start PostgreSQL
	docker-compose up -d

docker-down: ## Stop PostgreSQL
	docker-compose down

migrate-up: ## Run migrations
	migrate -path backend\ golang/migrations -database "$(DB_URL)" up

migrate-down: ## Rollback last migration
	migrate -path backend\ golang/migrations -database "$(DB_URL)" down 1

migrate-status: ## Check migration version
	migrate -path backend\ golang/migrations -database "$(DB_URL)" version

migrate-create: ## Create new migration (use: make migrate-create name=add_users_table)
	migrate create -ext sql -dir backend\ golang/migrations -seq $(name)

migrate-force: ## Force version (use: make migrate-force version=1)
	migrate -path backend\ golang/migrations -database "$(DB_URL)" force $(version)

run: ## Run the Go server
	cd backend\ golang && go run .
