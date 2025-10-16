#!/bin/bash

# 🚀 Script de Deploy Automatizado para Produção
# Uso: ./scripts/deploy-production.sh

set -e  # Sair em caso de erro

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configurações
PROJECT_DIR="/var/www/WhatsAppSalon-N8N"
BACKUP_DIR="/var/backups/whatsapp-salon"
PM2_PROCESS_NAME="universal-booking-system"
HEALTH_CHECK_URL="http://localhost:3000/api/health"

echo -e "${BLUE}🚀 ========== DEPLOY PRODUCTION ==========${NC}"
echo -e "${BLUE}📅 Data: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo ""

# 1. Verificar se está no servidor de produção
echo -e "${YELLOW}🔍 Verificando ambiente...${NC}"
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}❌ Diretório do projeto não encontrado: $PROJECT_DIR${NC}"
    echo -e "${YELLOW}ℹ️  Executando deploy localmente (desenvolvimento)${NC}"
    PROJECT_DIR="."
fi

cd "$PROJECT_DIR"
echo -e "${GREEN}✅ Diretório: $(pwd)${NC}"

# 2. Criar backup do código atual
echo -e "${YELLOW}📦 Criando backup do código atual...${NC}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_FILE" \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.git' \
    --exclude='logs' \
    . 2>/dev/null || true

if [ -f "$BACKUP_FILE" ]; then
    echo -e "${GREEN}✅ Backup criado: $BACKUP_FILE${NC}"
else
    echo -e "${YELLOW}⚠️  Backup não criado (pode não ter permissões)${NC}"
fi

# 3. Verificar se há mudanças no Git
echo -e "${YELLOW}🔍 Verificando mudanças no Git...${NC}"
git fetch origin main

CURRENT_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/main)

if [ "$CURRENT_COMMIT" = "$REMOTE_COMMIT" ]; then
    echo -e "${GREEN}✅ Já está na versão mais recente${NC}"
    echo -e "${YELLOW}🤔 Deseja fazer rebuild mesmo assim? (y/n)${NC}"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}🛑 Deploy cancelado${NC}"
        exit 0
    fi
else
    echo -e "${YELLOW}📥 Há novas mudanças disponíveis${NC}"
    echo -e "${BLUE}   Current: ${CURRENT_COMMIT:0:8}${NC}"
    echo -e "${BLUE}   Remote:  ${REMOTE_COMMIT:0:8}${NC}"
fi

# 4. Salvar status do serviço antes de parar
echo -e "${YELLOW}💾 Salvando status do serviço...${NC}"
SERVICE_WAS_RUNNING=false
if pm2 show "$PM2_PROCESS_NAME" &>/dev/null; then
    SERVICE_WAS_RUNNING=true
    echo -e "${GREEN}✅ Serviço está rodando${NC}"
else
    echo -e "${YELLOW}⚠️  Serviço não está rodando no PM2${NC}"
fi

# 5. Puxar mudanças do GitHub
echo -e "${YELLOW}📥 Puxando mudanças do GitHub...${NC}"
git pull origin main

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Erro ao fazer git pull${NC}"
    echo -e "${YELLOW}🔄 Tentando rollback...${NC}"
    git reset --hard "$CURRENT_COMMIT"
    exit 1
fi
echo -e "${GREEN}✅ Código atualizado com sucesso${NC}"

# 6. Verificar se há novas dependências
echo -e "${YELLOW}📦 Verificando dependências...${NC}"
if git diff --name-only "$CURRENT_COMMIT" HEAD | grep -q "package.json"; then
    echo -e "${YELLOW}🔄 package.json modificado - instalando dependências...${NC}"
    npm install
    echo -e "${GREEN}✅ Dependências instaladas${NC}"
else
    echo -e "${GREEN}✅ Nenhuma mudança em dependências${NC}"
fi

# 7. Fazer build do TypeScript
echo -e "${YELLOW}🔨 Fazendo build do TypeScript...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Erro no build do TypeScript${NC}"
    echo -e "${YELLOW}🔄 Fazendo rollback...${NC}"
    git reset --hard "$CURRENT_COMMIT"
    npm install
    npm run build
    exit 1
fi
echo -e "${GREEN}✅ Build concluído com sucesso${NC}"

# 8. Reiniciar o serviço PM2
echo -e "${YELLOW}🔄 Reiniciando serviço...${NC}"

if [ "$SERVICE_WAS_RUNNING" = true ]; then
    pm2 restart "$PM2_PROCESS_NAME"
    echo -e "${GREEN}✅ Serviço reiniciado${NC}"
else
    echo -e "${YELLOW}⚠️  Serviço não estava rodando - iniciando agora...${NC}"
    pm2 start dist/index.js --name "$PM2_PROCESS_NAME"
    pm2 save
    echo -e "${GREEN}✅ Serviço iniciado${NC}"
fi

# 9. Aguardar alguns segundos para o servidor iniciar
echo -e "${YELLOW}⏳ Aguardando servidor iniciar...${NC}"
sleep 5

# 10. Verificar health check
echo -e "${YELLOW}🏥 Verificando health check...${NC}"
MAX_RETRIES=10
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s -f "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Health check passou!${NC}"
        echo -e "${GREEN}🎉 Deploy concluído com sucesso!${NC}"
        echo ""
        echo -e "${BLUE}📊 Status do serviço:${NC}"
        pm2 show "$PM2_PROCESS_NAME" 2>/dev/null || echo "PM2 não disponível"
        echo ""
        echo -e "${BLUE}📝 Logs recentes:${NC}"
        pm2 logs "$PM2_PROCESS_NAME" --lines 10 --nostream 2>/dev/null || echo "Logs não disponíveis"
        echo ""
        echo -e "${GREEN}✅ ubs.app.br está atualizado!${NC}"
        exit 0
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -e "${YELLOW}⏳ Tentativa $RETRY_COUNT/$MAX_RETRIES...${NC}"
    sleep 3
done

# 11. Health check falhou - fazer rollback
echo -e "${RED}❌ Health check falhou após $MAX_RETRIES tentativas${NC}"
echo -e "${YELLOW}🔄 Fazendo rollback automático...${NC}"

git reset --hard "$CURRENT_COMMIT"
npm install
npm run build
pm2 restart "$PM2_PROCESS_NAME"

echo -e "${RED}❌ Deploy falhou e rollback foi executado${NC}"
echo -e "${YELLOW}📋 Verifique os logs: pm2 logs $PM2_PROCESS_NAME${NC}"
exit 1
