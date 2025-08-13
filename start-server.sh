#!/bin/bash

echo "🚀 Iniciando UBS - Universal Booking System"
echo "=========================================="

# Verificar se a porta 3000 está livre
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Porta 3000 já está em uso. Tentando parar processos..."
    pkill -f "ts-node" 2>/dev/null || true
    sleep 2
fi

# Iniciar servidor
echo "🔄 Iniciando servidor em modo desenvolvimento..."
npm run dev

echo "🌐 Servidor disponível em: http://localhost:3000"
echo "📊 Dashboard Principal: http://localhost:3000/dashboard-standardized.html"
echo "📋 Agendamentos: http://localhost:3000/appointments-standardized.html"
echo "👥 Clientes: http://localhost:3000/customers-standardized.html"
echo ""
echo "Para parar o servidor, pressione Ctrl+C"