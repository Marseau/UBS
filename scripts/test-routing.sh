#!/bin/bash

echo "🧪 Teste de Roteamento de Landing Pages"
echo "========================================"
echo ""

echo "1️⃣ Testando localhost:3000 (deve retornar landing.html):"
curl -s http://localhost:3000 | grep -o '<title>[^<]*</title>'
echo ""

echo "2️⃣ Testando localhost:3000/taylor-made (deve retornar landingTM.html):"
curl -s http://localhost:3000/taylor-made | grep -o '<title>[^<]*</title>'
echo ""

echo "3️⃣ Simulando Host: ubs.app.br (deve retornar landingTM.html):"
curl -s -H "Host: ubs.app.br" http://localhost:3000 | grep -o '<title>[^<]*</title>'
echo ""

echo "4️⃣ Simulando Host: dev.ubs.app.br (deve retornar landing.html):"
curl -s -H "Host: dev.ubs.app.br" http://localhost:3000 | grep -o '<title>[^<]*</title>'
echo ""

echo "5️⃣ Testando ubs.app.br REAL (se DNS configurado):"
curl -s https://ubs.app.br 2>/dev/null | grep -o '<title>[^<]*</title>' || echo "❌ DNS não acessível ou servidor não configurado"
echo ""

echo "6️⃣ Testando dev.ubs.app.br REAL (se DNS configurado):"
curl -s https://dev.ubs.app.br 2>/dev/null | grep -o '<title>[^<]*</title>' || echo "❌ DNS não acessível ou servidor não configurado"
echo ""

echo "✅ Resultados Esperados:"
echo "   1 e 4: UBS | Automatize seus Agendamentos com IA"
echo "   2 e 3: UBS Taylor Made | Automação de Leads via WhatsApp + IA"
