#!/bin/bash

# 🎯 Setup Completo do Sistema UBS Analytics
# Este script executa toda a configuração necessária para demonstrar o sistema

set -e  # Parar em caso de erro

echo "🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀"
echo "🎯 CONFIGURAÇÃO COMPLETA DO SISTEMA UBS ANALYTICS"
echo "🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀"
echo ""

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Instale o Node.js primeiro."
    exit 1
fi

# Verificar se as variáveis de ambiente estão configuradas
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "⚠️  ATENÇÃO: Configure as variáveis de ambiente:"
    echo "   export SUPABASE_URL='https://seu-projeto.supabase.co'"
    echo "   export SUPABASE_SERVICE_ROLE_KEY='sua-service-role-key'"
    echo ""
    echo "🔄 Continuando com valores padrão (podem falhar)..."
    echo ""
fi

# Instalar dependências se necessário
if [ ! -d "scripts/node_modules" ]; then
    echo "📦 Instalando dependências dos scripts..."
    cd scripts
    npm install
    cd ..
    echo "✅ Dependências instaladas"
    echo ""
fi

# Executar configuração completa
echo "🎯 Iniciando configuração completa do sistema..."
echo "⏱️  Tempo estimado: 5-10 minutos"
echo ""

node scripts/setup-complete-system.js

# Verificar resultado
if [ $? -eq 0 ]; then
    echo ""
    echo "🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉"
    echo "✅ SISTEMA CONFIGURADO COM SUCESSO!"
    echo "🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉"
    echo ""
    echo "🔧 PRÓXIMOS PASSOS:"
    echo "1. 🌐 Inicie o servidor: npm start"
    echo "2. 📊 Acesse o dashboard: http://localhost:3000"
    echo "3. 👨‍💼 Use login de super admin para ver todos os dados"
    echo "4. ⏰ Configure cron job: ./scripts/setup-cron-job.sh"
    echo ""
    echo "📋 DADOS DISPONÍVEIS:"
    echo "• 25 tenants com perfis diversos"
    echo "• 90 dias de dados históricos"
    echo "• Agendamentos, clientes, receitas"
    echo "• Conversas de IA simuladas"
    echo "• Métricas pré-calculadas"
    echo ""
    echo "🎯 O sistema está pronto para demonstração!"
    
else
    echo ""
    echo "❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌"
    echo "❌ ERRO NA CONFIGURAÇÃO"
    echo "❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌"
    echo ""
    echo "🔧 SOLUÇÕES:"
    echo "1. Verifique as variáveis de ambiente"
    echo "2. Verifique a conexão com Supabase"
    echo "3. Execute manualmente: node scripts/setup-complete-system.js"
    echo "4. Veja os logs de erro acima"
    echo ""
    exit 1
fi 