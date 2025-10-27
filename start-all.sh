#!/bin/bash

# 🚀 Start All - Inicia servidor Node.js + Cloudflare Tunnel
# Executa tudo que é necessário para ubs.app.br funcionar

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚀 UBS App - Inicialização Completa"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Verificar se servidor já está rodando
echo "1️⃣  Verificando servidor Node.js..."

if lsof -i :3000 > /dev/null 2>&1; then
    echo "✅ Servidor já está rodando na porta 3000"
else
    echo "🚀 Iniciando servidor Node.js..."
    PORT=3000 npm start > /tmp/node-server.log 2>&1 &
    NODE_PID=$!

    echo "⏳ Aguardando servidor inicializar..."
    sleep 5

    if lsof -i :3000 > /dev/null 2>&1; then
        echo "✅ Servidor Node.js iniciado! PID: $NODE_PID"
        echo "   Logs: tail -f /tmp/node-server.log"
    else
        echo "❌ Erro ao iniciar servidor"
        cat /tmp/node-server.log
        exit 1
    fi
fi

echo ""

# 2. Verificar se túnel já está rodando
echo "2️⃣  Verificando Cloudflare Tunnel..."

if pgrep -f "cloudflared tunnel run dev-tunnel" > /dev/null; then
    echo "✅ Túnel já está rodando!"
else
    echo "🚇 Iniciando Cloudflare Tunnel..."
    cloudflared tunnel run dev-tunnel > /tmp/cloudflare-tunnel.log 2>&1 &
    TUNNEL_PID=$!

    echo "⏳ Aguardando túnel conectar..."
    sleep 5

    if ps -p $TUNNEL_PID > /dev/null 2>&1; then
        echo "✅ Túnel conectado! PID: $TUNNEL_PID"
        echo "   Logs: tail -f /tmp/cloudflare-tunnel.log"
    else
        echo "❌ Erro ao conectar túnel"
        cat /tmp/cloudflare-tunnel.log
        exit 1
    fi
fi

echo ""

# 3. Testar conectividade
echo "3️⃣  Testando conectividade..."

# Testar localhost
if curl -s -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ localhost:3000 → OK"
else
    echo "⚠️  localhost:3000/health → Sem resposta (normal se endpoint não existir)"
fi

# Testar dev.ubs.app.br
sleep 2
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://dev.ubs.app.br 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
    echo "✅ dev.ubs.app.br → HTTP $HTTP_CODE"
else
    echo "⚠️  dev.ubs.app.br → HTTP $HTTP_CODE (aguarde alguns segundos)"
fi

# Testar ubs.app.br
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://ubs.app.br 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
    echo "✅ ubs.app.br → HTTP $HTTP_CODE"
else
    echo "⚠️  ubs.app.br → HTTP $HTTP_CODE (verifique Cloudflare Worker)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Sistema Inicializado!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Acesse agora:"
echo "   https://ubs.app.br/content-approval"
echo ""
echo "📊 Processos rodando:"
if lsof -i :3000 > /dev/null 2>&1; then
    echo "   • Node.js (porta 3000): PID $(lsof -t -i :3000)"
fi
if pgrep -f "cloudflared tunnel run dev-tunnel" > /dev/null; then
    echo "   • Cloudflare Tunnel: PID $(pgrep -f 'cloudflared tunnel run dev-tunnel')"
fi
echo ""
echo "📝 Logs em tempo real:"
echo "   tail -f /tmp/node-server.log       # Servidor Node.js"
echo "   tail -f /tmp/cloudflare-tunnel.log # Túnel Cloudflare"
echo ""
echo "🛑 Para parar tudo:"
echo "   pkill -f 'npm start'"
echo "   pkill -f 'cloudflared tunnel'"
echo ""
