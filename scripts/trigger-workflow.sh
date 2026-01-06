#!/bin/bash
# Trigger N8N Workflow via API
# Usage: ./trigger-workflow.sh [workflow_id]

N8N_HOST="${N8N_HOST:-http://localhost:5678}"
N8N_API_KEY="${N8N_API_KEY:-}"
WORKFLOW_ID="${1:-7b8hgtIj7Ea99RBF}"

echo "🚀 Triggering workflow: $WORKFLOW_ID"

# Executar workflow (não apenas ativar)
response=$(curl -s -X POST \
  "${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}/run" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json")

echo "📋 Response: $response"

# Verificar se executou
if echo "$response" | grep -q "executionId"; then
  execution_id=$(echo "$response" | grep -o '"executionId":"[^"]*"' | cut -d'"' -f4)
  echo "✅ Execution started: $execution_id"
else
  echo "❌ Failed to trigger workflow"
  echo "$response"
fi
