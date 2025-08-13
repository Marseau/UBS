#!/bin/bash

# Script para verificar e iniciar Docker Desktop se necessário

echo "🐳 Verificando status do Docker..."

# Verificar se Docker está rodando
if ! docker info &> /dev/null; then
    echo "⚠️  Docker não está rodando. Tentando iniciar..."
    
    # Verificar se estamos no macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "🍎 Detectado macOS - iniciando Docker Desktop..."
        
        # Tentar abrir Docker Desktop
        if [ -d "/Applications/Docker.app" ]; then
            open -a Docker
            echo "📱 Docker Desktop iniciado. Aguardando inicialização..."
            
            # Aguardar Docker ficar disponível (máximo 60 segundos)
            for i in {1..30}; do
                if docker info &> /dev/null; then
                    echo "✅ Docker está rodando!"
                    break
                fi
                echo "⏳ Aguardando Docker... ($i/30)"
                sleep 2
            done
            
            # Verificar se Docker está rodando agora
            if ! docker info &> /dev/null; then
                echo "❌ Falha ao iniciar Docker. Por favor, inicie manualmente:"
                echo "   1. Abra Docker Desktop"
                echo "   2. Aguarde a inicialização completa"
                echo "   3. Execute este script novamente"
                exit 1
            fi
        else
            echo "❌ Docker Desktop não encontrado em /Applications/Docker.app"
            echo "Por favor, instale Docker Desktop para macOS"
            exit 1
        fi
    else
        echo "🐧 Sistema Linux detectado. Tentando iniciar Docker daemon..."
        sudo systemctl start docker
        
        if ! docker info &> /dev/null; then
            echo "❌ Falha ao iniciar Docker daemon"
            echo "Execute manualmente: sudo systemctl start docker"
            exit 1
        fi
    fi
else
    echo "✅ Docker já está rodando!"
fi

# Mostrar informações do Docker
echo "📊 Informações do Docker:"
docker --version
docker compose version

echo "🎉 Docker está pronto para uso!"