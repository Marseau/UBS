#!/bin/bash

# Script para configurar o cron job de analytics às 4:00 AM
# Este script configura o sistema para executar automaticamente os cálculos de métricas

set -e

echo "🚀 Configurando Cron Job de Analytics UBS"
echo "========================================"

# Verificar se o Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Instale o Node.js primeiro."
    exit 1
fi

# Verificar se estamos no diretório correto
if [ ! -f "package.json" ]; then
    echo "❌ Execute este script no diretório raiz do projeto"
    exit 1
fi

# Diretório do projeto
PROJECT_DIR=$(pwd)
SCRIPTS_DIR="$PROJECT_DIR/scripts"
CRON_SCRIPT="$SCRIPTS_DIR/daily-analytics-cron.js"

echo "📁 Diretório do projeto: $PROJECT_DIR"

# Verificar se o script de cron existe
if [ ! -f "$CRON_SCRIPT" ]; then
    echo "❌ Script de cron não encontrado: $CRON_SCRIPT"
    exit 1
fi

# Instalar dependências dos scripts se necessário
if [ -f "$SCRIPTS_DIR/package.json" ]; then
    echo "📦 Instalando dependências dos scripts..."
    cd "$SCRIPTS_DIR"
    npm install
    cd "$PROJECT_DIR"
fi

# Tornar os scripts executáveis
chmod +x "$SCRIPTS_DIR"/*.js
chmod +x "$SCRIPTS_DIR"/*.sh

echo "✅ Scripts tornados executáveis"

# Criar arquivo de log
LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"
touch "$LOG_DIR/cron-analytics.log"

echo "📝 Arquivo de log criado: $LOG_DIR/cron-analytics.log"

# Verificar variáveis de ambiente
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "⚠️ AVISO: Variáveis de ambiente não configuradas"
    echo "Configure as seguintes variáveis:"
    echo "  - SUPABASE_URL"
    echo "  - SUPABASE_SERVICE_ROLE_KEY"
    echo ""
    echo "Exemplo para .env:"
    echo "SUPABASE_URL=https://your-project.supabase.co"
    echo "SUPABASE_SERVICE_ROLE_KEY=your-service-role-key"
fi

# Criar entrada do cron job
CRON_ENTRY="0 4 * * * cd $PROJECT_DIR && /usr/bin/node $CRON_SCRIPT >> $LOG_DIR/cron-analytics.log 2>&1"

echo "⏰ Configurando cron job..."
echo "Entrada do cron: $CRON_ENTRY"

# Verificar se a entrada já existe
if crontab -l 2>/dev/null | grep -q "daily-analytics-cron.js"; then
    echo "⚠️ Cron job já existe. Removendo entrada anterior..."
    crontab -l 2>/dev/null | grep -v "daily-analytics-cron.js" | crontab -
fi

# Adicionar nova entrada
(crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -

echo "✅ Cron job configurado com sucesso!"

# Mostrar cron jobs atuais
echo ""
echo "📋 Cron jobs atuais:"
crontab -l

# Criar script de monitoramento
MONITOR_SCRIPT="$SCRIPTS_DIR/monitor-cron.sh"
cat > "$MONITOR_SCRIPT" << 'EOF'
#!/bin/bash

# Script para monitorar o cron job de analytics

PROJECT_DIR=$(dirname $(dirname $(realpath $0)))
LOG_FILE="$PROJECT_DIR/logs/cron-analytics.log"

echo "📊 Monitor do Cron Job de Analytics"
echo "=================================="
echo "Log file: $LOG_FILE"
echo ""

# Verificar se o cron job está configurado
if crontab -l 2>/dev/null | grep -q "daily-analytics-cron.js"; then
    echo "✅ Cron job está configurado"
else
    echo "❌ Cron job NÃO está configurado"
    exit 1
fi

# Mostrar últimas 20 linhas do log
if [ -f "$LOG_FILE" ]; then
    echo "📝 Últimas execuções:"
    echo "-------------------"
    tail -20 "$LOG_FILE"
else
    echo "⚠️ Arquivo de log não encontrado"
fi

# Verificar próxima execução
echo ""
echo "⏰ Próxima execução: Todos os dias às 04:00"
echo "🕐 Hora atual: $(date)"

# Verificar se há erros recentes
if [ -f "$LOG_FILE" ] && grep -q "ERROR" "$LOG_FILE"; then
    echo ""
    echo "⚠️ ATENÇÃO: Erros encontrados no log!"
    echo "Últimos erros:"
    grep "ERROR" "$LOG_FILE" | tail -5
fi
EOF

chmod +x "$MONITOR_SCRIPT"

echo ""
echo "🔍 Script de monitoramento criado: $MONITOR_SCRIPT"
echo "Execute: ./scripts/monitor-cron.sh para monitorar"

# Criar script de teste
TEST_SCRIPT="$SCRIPTS_DIR/test-cron-manual.sh"
cat > "$TEST_SCRIPT" << EOF
#!/bin/bash

# Script para testar o cron job manualmente

echo "🧪 Executando teste manual do cron job..."
cd "$PROJECT_DIR"
node "$CRON_SCRIPT"
echo "✅ Teste concluído. Verifique o log para resultados."
EOF

chmod +x "$TEST_SCRIPT"

echo "🧪 Script de teste criado: $TEST_SCRIPT"
echo "Execute: ./scripts/test-cron-manual.sh para testar"

echo ""
echo "🎉 CONFIGURAÇÃO CONCLUÍDA!"
echo "========================="
echo ""
echo "📋 Próximos passos:"
echo "1. Configure as variáveis de ambiente (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)"
echo "2. Execute o teste: ./scripts/test-cron-manual.sh"
echo "3. Monitore as execuções: ./scripts/monitor-cron.sh"
echo "4. Verifique os logs em: $LOG_DIR/cron-analytics.log"
echo ""
echo "⏰ O cron job executará automaticamente todos os dias às 04:00"
echo "📊 Os dados do dashboard serão atualizados automaticamente"
echo ""
echo "🔧 Para remover o cron job:"
echo "   crontab -l | grep -v 'daily-analytics-cron.js' | crontab -" 