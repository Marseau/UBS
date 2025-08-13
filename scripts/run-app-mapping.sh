#!/bin/bash

# Script para execução rápida do mapeamento automático do app
# Uso: ./scripts/run-app-mapping.sh
op
echo "🗺️  Iniciando Mapeamento Automático do App"
echo "=========================================="

# Verificar se o Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Instale o Node.js primeiro."
    exit 1
fi

# Verificar se o Puppeteer está instalado
if ! node -e "require('puppeteer')" &> /dev/null; then
    echo "📦 Instalando Puppeteer..."
    npm install puppeteer
fi

# Verificar se o arquivo de configuração existe
if [ ! -f "scripts/app-mapping-config.js" ]; then
    echo "❌ Arquivo de configuração não encontrado: scripts/app-mapping-config.js"
    echo "📝 Crie o arquivo de configuração primeiro."
    exit 1
fi

# Verificar se o script principal existe
if [ ! -f "scripts/app-mapping-puppeteer.js" ]; then
    echo "❌ Script principal não encontrado: scripts/app-mapping-puppeteer.js"
    exit 1
fi

echo "✅ Dependências verificadas"
echo ""

# Perguntar se quer usar configuração padrão ou personalizada
echo "Escolha uma opção:"
echo "1) Usar configuração padrão (scripts/app-mapping-config.js)"
echo "2) Executar com configuração personalizada"
echo "3) Executar em modo headless (sem interface gráfica)"
echo "4) Executar apenas páginas específicas"
echo ""

read -p "Digite sua escolha (1-4): " choice

case $choice in
    1)
        echo "🚀 Executando com configuração padrão..."
        node scripts/app-mapping-puppeteer.js
        ;;
    2)
        echo "🚀 Executando com configuração personalizada..."
        echo "Edite o arquivo scripts/app-mapping-config.js antes de continuar"
        read -p "Pressione Enter quando estiver pronto..."
        node scripts/app-mapping-puppeteer.js
        ;;
    3)
        echo "🚀 Executando em modo headless..."
        node -e "
        const AppMapper = require('./scripts/app-mapping-puppeteer');
        const config = require('./scripts/app-mapping-config');
        config.browser.headless = true;
        config.delay = 1000;
        const mapper = new AppMapper(config);
        mapper.run();
        "
        ;;
    4)
        echo "🚀 Executando páginas específicas..."
        echo "Digite as páginas que deseja mapear (separadas por vírgula):"
        echo "Exemplo: /dashboard,/appointments,/analytics"
        read -p "Páginas: " pages
        node -e "
        const AppMapper = require('./scripts/app-mapping-puppeteer');
        const config = require('./scripts/app-mapping-config');
        config.specificPages = '$pages'.split(',').map(p => p.trim());
        const mapper = new AppMapper(config);
        mapper.run();
        "
        ;;
    *)
        echo "❌ Opção inválida"
        exit 1
        ;;
esac

echo ""
echo "🎉 Mapeamento concluído!"
echo "📁 Resultados salvos em:"
echo "   - app-mapping-results/app-mapping-report.json"
echo "   - app-mapping-results/app-mapping-report.html"
echo "   - app-mapping-screenshots/"

# Abrir relatório HTML se existir
if [ -f "app-mapping-results/app-mapping-report.html" ]; then
    echo ""
    read -p "Deseja abrir o relatório HTML? (y/n): " open_report
    if [ "$open_report" = "y" ] || [ "$open_report" = "Y" ]; then
        if command -v open &> /dev/null; then
            open app-mapping-results/app-mapping-report.html
        elif command -v xdg-open &> /dev/null; then
            xdg-open app-mapping-results/app-mapping-report.html
        else
            echo "📄 Relatório disponível em: app-mapping-results/app-mapping-report.html"
        fi
    fi
fi 