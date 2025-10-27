#!/bin/bash

# Script para atualizar workflows do N8N via API REST
# Requer: jq instalado (brew install jq)

# Configurações
N8N_URL="http://localhost:5678"
N8N_USER="admin"
N8N_PASSWORD="admin123"

# IDs dos Workflows
CONTENT_SEEDER_ID="SswvkJMpyu4pd6dA"
CANVA_PNG_EXPORT_ID="XW5G28IkaZQzfWk2"

echo "🔄 Atualizando Workflows N8N..."

# Função para obter token de autenticação
get_auth_token() {
  local auth_header=$(echo -n "${N8N_USER}:${N8N_PASSWORD}" | base64)
  echo "Basic ${auth_header}"
}

AUTH_TOKEN=$(get_auth_token)

# 1. Buscar Workflow Content Seeder
echo "📥 Buscando workflow Content Seeder (${CONTENT_SEEDER_ID})..."
CONTENT_SEEDER=$(curl -s -X GET \
  "${N8N_URL}/api/v1/workflows/${CONTENT_SEEDER_ID}" \
  -H "Authorization: ${AUTH_TOKEN}" \
  -H "Content-Type: application/json")

if [ $? -ne 0 ]; then
  echo "❌ Erro ao buscar workflow Content Seeder"
  echo "Certifique-se que o N8N está rodando e as credenciais estão corretas"
  exit 1
fi

echo "✅ Workflow Content Seeder encontrado"

# 2. Atualizar Node 9 (Generate Dual Persona Reel → Generate Canva Hybrid Reel)
echo "🔧 Atualizando node 'Generate Dual Persona Reel'..."

# Aqui você precisaria parsear o JSON e atualizar o node específico
# Exemplo usando jq (requer instalação: brew install jq)
# UPDATED_WORKFLOW=$(echo "$CONTENT_SEEDER" | jq '.nodes[9].name = "Generate Canva Hybrid Reel"')
# UPDATED_WORKFLOW=$(echo "$UPDATED_WORKFLOW" | jq '.nodes[9].parameters.url = "https://ubs.app.br/api/canva-hybrid-video/generate/{{ $json.id }}"')
# UPDATED_WORKFLOW=$(echo "$UPDATED_WORKFLOW" | jq '.nodes[9].parameters.timeout = 180000')

echo "⚠️  ATENÇÃO: Este script é um template!"
echo "Para completar a atualização, você precisa:"
echo "1. Instalar jq: brew install jq"
echo "2. Descomentar as linhas de atualização acima"
echo "3. Ajustar os índices dos nodes conforme necessário"
echo ""
echo "🔗 Ou use a interface web do N8N:"
echo "   ${N8N_URL}"
echo "   Usuário: ${N8N_USER}"
echo "   Senha: ${N8N_PASSWORD}"
echo ""
echo "📝 Mudanças necessárias:"
echo ""
echo "WORKFLOW 1: Content Seeder (${CONTENT_SEEDER_ID})"
echo "  Node 9 - 'Generate Dual Persona Reel':"
echo "    - Nome: 'Generate Canva Hybrid Reel'"
echo "    - URL: https://ubs.app.br/api/canva-hybrid-video/generate/{{ \$json.id }}"
echo "    - Método: POST"
echo "    - Timeout: 180000 (3 minutos)"
echo "    - Headers: Content-Type: application/json"
echo ""
echo "  Node 12 - Email:"
echo "    - Subject: Incluir 'Canva Hybrid' no assunto"
echo ""
echo "WORKFLOW 2: Canva PNG Export (${CANVA_PNG_EXPORT_ID})"
echo "  Verificar configurações:"
echo "    - Format: png"
echo "    - Quality: horizontal_1080p"
echo ""
