#!/bin/bash

# 🚇 Script para Iniciar Túnel Cloudflare dev-tunnel
# Mantém dev.ubs.app.br conectado ao localhost:3000

set -e

echo "🚇 Iniciando Cloudflare Tunnel..."
echo ""
echo "Túnel: dev-tunnel"
echo "Rota: dev.ubs.app.br → localhost:3000"
echo ""

# Verificar se túnel já está rodando
if pgrep -f "cloudflared tunnel run dev-tunnel" > /dev/null; then
    echo "⚠️  Túnel já está rodando!"
    echo ""
    echo "PIDs:"
    pgrep -f "cloudflared tunnel run dev-tunnel"
    echo ""
    echo "Para parar: pkill -f 'cloudflared tunnel run dev-tunnel'"
    exit 0
fi

# Verificar se servidor Node.js está rodando
if ! lsof -i :3000 > /dev/null 2>&1; then
    echo "❌ Servidor Node.js não está rodando na porta 3000"
    echo ""
    echo "Inicie primeiro: npm start"
    exit 1
fi

echo "✅ Servidor Node.js rodando na porta 3000"
echo ""

# Iniciar túnel em background
echo "🚀 Iniciando túnel em background..."
cloudflared tunnel run dev-tunnel > /tmp/cloudflare-tunnel.log 2>&1 &

TUNNEL_PID=$!

echo "✅ Túnel iniciado! PID: $TUNNEL_PID"
echo ""

# Aguardar conexão
echo "⏳ Aguardando conexão..."
sleep 5

# Verificar se está rodando
if ps -p $TUNNEL_PID > /dev/null; then
    echo "✅ Túnel conectado com sucesso!"
    echo ""
    echo "📊 Status:"
    echo "  - Túnel PID: $TUNNEL_PID"
    echo "  - Logs: tail -f /tmp/cloudflare-tunnel.log"
    echo "  - Testar: curl -I https://dev.ubs.app.br"
    echo ""
    echo "🌐 Acesse agora:"
    echo "  https://ubs.app.br/content-approval"
    echo ""
    echo "🛑 Para parar:"
    echo "  kill $TUNNEL_PID"
    echo "  ou: pkill -f 'cloudflared tunnel run dev-tunnel'"
else
    echo "❌ Erro ao iniciar túnel"
    echo "Logs:"
    cat /tmp/cloudflare-tunnel.log
    exit 1
fi
