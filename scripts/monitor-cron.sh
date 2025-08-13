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
