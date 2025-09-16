#!/bin/bash

# 🔄 Script de Rollback da Migração Modular
# Restaura arquivos originais em caso de problemas

set -e

echo "⚠️  ROLLBACK DA MIGRAÇÃO MODULAR"
echo "📅 Data: $(date)"
echo "👤 Usuário: $(whoami)"
echo ""

# Verificar se estamos no diretório correto
if [ ! -f "package.json" ]; then
  echo "❌ Erro: Execute o script na raiz do projeto"
  exit 1
fi

echo "🔍 Procurando backups disponíveis..."

# Procurar diretório de backup mais recente
BACKUP_DIR=$(find backups -name "migration-*" -type d | sort -r | head -1)

if [ -z "$BACKUP_DIR" ]; then
  echo "❌ Nenhum backup de migração encontrado"
  echo "🔍 Diretórios disponíveis em backups/:"
  ls -la backups/ 2>/dev/null || echo "  (nenhum)"
  exit 1
fi

echo "✅ Backup encontrado: $BACKUP_DIR"

echo ""
echo "📋 Restaurando arquivos originais..."

# Restaurar orchestrator
if [ -f "$BACKUP_DIR/webhook-flow-orchestrator.service.ts.backup" ]; then
  cp "$BACKUP_DIR/webhook-flow-orchestrator.service.ts.backup" src/services/webhook-flow-orchestrator.service.ts
  echo "✅ webhook-flow-orchestrator.service.ts restaurado"
else
  echo "❌ Backup do orchestrator não encontrado"
  exit 1
fi

# Restaurar routes
if [ -f "$BACKUP_DIR/whatsapp-webhook-v3.routes.ts.backup" ]; then
  cp "$BACKUP_DIR/whatsapp-webhook-v3.routes.ts.backup" src/routes/whatsapp-webhook-v3.routes.ts
  echo "✅ whatsapp-webhook-v3.routes.ts restaurado"
else
  echo "❌ Backup das routes não encontrado"
  exit 1
fi

echo ""
echo "📋 Verificando restauração..."

# Verificar compilação
echo "🔧 Testando compilação..."
if npm run build > /tmp/rollback_build.log 2>&1; then
  echo "✅ Compilação OK"
else
  echo "❌ Compilação falhou após rollback"
  echo "📋 Log de erro:"
  tail -10 /tmp/rollback_build.log
  exit 1
fi

echo ""
echo "🎉 ROLLBACK CONCLUÍDO COM SUCESSO!"
echo ""
echo "📊 Arquivos restaurados para versão original:"
echo "  ✅ webhook-flow-orchestrator.service.ts (versão monolítica)"
echo "  ✅ whatsapp-webhook-v3.routes.ts (versão original)"
echo ""
echo "⚠️  Os módulos refatorados permanecem no diretório:"
echo "  📁 src/services/orchestrator/ (pode ser removido se desejar)"
echo "  📁 src/routes/webhook/ (pode ser removido se desejar)"
echo ""
echo "🔧 Reinicie o servidor: npm run dev"
echo ""