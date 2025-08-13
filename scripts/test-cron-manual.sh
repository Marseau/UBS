#!/bin/bash

# Script para testar o cron job manualmente

echo "🧪 Executando teste manual do cron job..."
cd "/Users/marseau/Developer/WhatsAppSalon-N8N"
node "/Users/marseau/Developer/WhatsAppSalon-N8N/scripts/daily-analytics-cron.js"
echo "✅ Teste concluído. Verifique o log para resultados."
