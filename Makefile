# Universal Booking System - Makefile
# Comandos para facilitar o desenvolvimento e deployment

.PHONY: help dev prod build test clean logs restart

# Mostrar ajuda
help:
	@echo "🚀 Universal Booking System - Comandos Disponíveis"
	@echo "=================================================="
	@echo ""
	@echo "📦 DESENVOLVIMENTO:"
	@echo "  make dev         - Iniciar ambiente de desenvolvimento"
	@echo "  make dev-build   - Build containers de desenvolvimento"
	@echo "  make dev-logs    - Mostrar logs de desenvolvimento"
	@echo "  make dev-stop    - Parar ambiente de desenvolvimento"
	@echo ""
	@echo "🚀 PRODUÇÃO:"
	@echo "  make prod        - Iniciar ambiente de produção"
	@echo "  make prod-build  - Build containers de produção"
	@echo "  make prod-logs   - Mostrar logs de produção"
	@echo "  make prod-stop   - Parar ambiente de produção"
	@echo ""
	@echo "🛠️  UTILITÁRIOS:"
	@echo "  make build       - Build todas as imagens"
	@echo "  make test        - Executar testes"
	@echo "  make clean       - Limpar containers e volumes"
	@echo "  make restart     - Reiniciar todos os serviços"
	@echo "  make shell       - Abrir shell no container da API"
	@echo "  make db-shell    - Abrir shell no PostgreSQL"
	@echo "  make redis-cli   - Abrir Redis CLI"
	@echo ""
	@echo "📊 MONITORAMENTO:"
	@echo "  make status      - Status dos containers"
	@echo "  make stats       - Estatísticas de recursos"
	@echo "  make health      - Health check de todos os serviços"
	@echo ""

# =================================
# COMANDOS DE DESENVOLVIMENTO
# =================================

# Iniciar ambiente de desenvolvimento
dev:
	@echo "🔧 Iniciando ambiente de desenvolvimento..."
	@cp -n .env.example .env 2>/dev/null || true
	docker compose -f docker-compose.dev.yml up -d
	@echo "✅ Ambiente de desenvolvimento iniciado!"
	@echo "📍 URLs disponíveis:"
	@echo "   API: http://localhost:3000"
	@echo "   N8N: http://localhost:5679"
	@echo "   Adminer: http://localhost:8080"
	@echo "   Redis Commander: http://localhost:8081"

# Build containers de desenvolvimento
dev-build:
	@echo "🔨 Building containers de desenvolvimento..."
	docker compose -f docker-compose.dev.yml build --no-cache

# Logs de desenvolvimento
dev-logs:
	docker compose -f docker-compose.dev.yml logs -f

# Parar desenvolvimento
dev-stop:
	@echo "⏹️  Parando ambiente de desenvolvimento..."
	docker compose -f docker-compose.dev.yml down

# =================================
# COMANDOS DE PRODUÇÃO
# =================================

# Iniciar ambiente de produção
prod:
	@echo "🚀 Iniciando ambiente de produção..."
	@cp -n .env.example .env 2>/dev/null || true
	docker compose up -d
	@echo "✅ Ambiente de produção iniciado!"
	@echo "📍 URLs disponíveis:"
	@echo "   API: http://localhost:3000"
	@echo "   N8N: http://localhost:5678"
	@echo "   Monitoring: http://localhost:9090"
	@echo "   Grafana: http://localhost:3001"

# Build containers de produção
prod-build:
	@echo "🔨 Building containers de produção..."
	docker compose build --no-cache

# Logs de produção
prod-logs:
	docker compose logs -f

# Parar produção
prod-stop:
	@echo "⏹️  Parando ambiente de produção..."
	docker compose down

# =================================
# UTILITÁRIOS
# =================================

# Build todas as imagens
build:
	@echo "🔨 Building todas as imagens..."
	docker compose build --no-cache
	docker compose -f docker-compose.dev.yml build --no-cache

# Executar testes
test:
	@echo "🧪 Executando testes..."
	cd universal-booking-system && npm test

# Limpeza completa
clean:
	@echo "🧹 Limpando containers e volumes..."
	docker compose down -v
	docker compose -f docker-compose.dev.yml down -v
	docker system prune -f
	docker volume prune -f

# Reiniciar serviços
restart:
	@echo "🔄 Reiniciando serviços..."
	docker compose restart
	docker compose -f docker-compose.dev.yml restart

# Shell no container da API
shell:
	docker exec -it booking-api-dev /bin/sh

# Shell no PostgreSQL
db-shell:
	docker exec -it postgres-dev psql -U postgres -d booking_system_dev

# Redis CLI
redis-cli:
	docker exec -it redis-dev redis-cli

# =================================
# MONITORAMENTO
# =================================

# Status dos containers
status:
	@echo "📊 Status dos containers:"
	@echo "========================="
	docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Estatísticas de recursos
stats:
	@echo "📈 Estatísticas de recursos:"
	@echo "============================"
	docker stats --no-stream

# Health check
health:
	@echo "🏥 Health check dos serviços:"
	@echo "============================="
	@curl -s http://localhost:3000/health | jq . || echo "❌ API não disponível"
	@curl -s http://localhost:5678/healthz || echo "❌ N8N não disponível"

# =================================
# INSTALAÇÃO E SETUP
# =================================

# Setup inicial completo
setup:
	@echo "⚙️  Executando setup inicial..."
	@./install-mcp-servers.sh
	@cp -n .env.example .env 2>/dev/null || true
	@echo "✅ Setup inicial concluído!"
	@echo "📝 Próximos passos:"
	@echo "   1. Edite o arquivo .env com suas configurações"
	@echo "   2. Execute 'make dev' para iniciar o desenvolvimento"

# Backup do banco de dados
backup:
	@echo "💾 Criando backup do banco de dados..."
	docker exec postgres-dev pg_dump -U postgres booking_system_dev > backup_$(shell date +%Y%m%d_%H%M%S).sql
	@echo "✅ Backup criado!"

# Restore do banco de dados
restore:
	@echo "📥 Para restaurar, execute:"
	@echo "docker exec -i postgres-dev psql -U postgres booking_system_dev < backup_file.sql"