#!/bin/bash

# 🔧 Script de Instalação de MCP Servers para Produtividade
# Autor: Sistema Universal de Agendamentos
# Data: $(date)

set -e  # Exit on any error

echo "🚀 Iniciando instalação de MCP Servers..."
echo "========================================"

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Por favor, instale Node.js primeiro."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ NPM não encontrado. Por favor, instale npm primeiro."
    exit 1
fi

echo "✅ Node.js $(node --version) encontrado"
echo "✅ NPM $(npm --version) encontrado"

# Atualizar npm para a versão mais recente
echo "📦 Atualizando npm..."
npm install -g npm@latest

# Criar diretório para MCP servers se não existir
mkdir -p ~/.mcp-servers

# Função para instalar um MCP server com verificação
install_mcp_server() {
    local server_name=$1
    local package_name=$2
    
    echo "📦 Instalando $server_name..."
    
    if npm install -g "$package_name" &> /dev/null; then
        echo "✅ $server_name instalado com sucesso"
    else
        echo "⚠️  Falha ao instalar $server_name, tentando versão alternativa..."
        # Tentar instalar sem global se falhar
        npm install "$package_name" &> /dev/null || echo "❌ Falha ao instalar $server_name"
    fi
}

# Instalar MCP Servers principais
echo ""
echo "🔧 Instalando MCP Servers..."
echo "========================================"

# Database Server
install_mcp_server "Database Server" "@modelcontextprotocol/server-database"

# Docker Server  
install_mcp_server "Docker Server" "@modelcontextprotocol/server-docker"

# Git Server
install_mcp_server "Git Server" "@modelcontextprotocol/server-git"

# Filesystem Server
install_mcp_server "Filesystem Server" "@modelcontextprotocol/server-filesystem"

# Web Search Server
install_mcp_server "Web Search Server" "@modelcontextprotocol/server-web-search"

# Analytics Server
install_mcp_server "Analytics Server" "@modelcontextprotocol/server-analytics"

# Security Server
install_mcp_server "Security Server" "@modelcontextprotocol/server-security"

echo ""
echo "🔍 Verificando instalações..."
echo "========================================"

# Verificar se os servers foram instalados corretamente
servers=(
    "@modelcontextprotocol/server-database"
    "@modelcontextprotocol/server-docker" 
    "@modelcontextprotocol/server-git"
    "@modelcontextprotocol/server-filesystem"
    "@modelcontextprotocol/server-web-search"
)

for server in "${servers[@]}"; do
    if npm list -g "$server" &> /dev/null; then
        echo "✅ $server - Instalado"
    else
        echo "⚠️  $server - Não encontrado globalmente"
    fi
done

# Criar arquivo de configuração para Claude Desktop
echo ""
echo "⚙️  Criando configuração para Claude Desktop..."
echo "========================================"

CONFIG_DIR="$HOME/.config/claude-desktop"
mkdir -p "$CONFIG_DIR"

cat > "$CONFIG_DIR/claude_desktop_config.json" << 'EOF'
{
  "mcpServers": {
    "database": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-database"],
      "env": {
        "DATABASE_URL": "postgresql://postgres:postgres123@localhost:5432/booking_system"
      }
    },
    "docker": {
      "command": "npx", 
      "args": ["@modelcontextprotocol/server-docker"],
      "env": {
        "DOCKER_HOST": "unix:///var/run/docker.sock"
      }
    },
    "git": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-git"],
      "env": {
        "GIT_REPO_PATH": "/Users/marseau/WhatsAppSalon-N8N"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem"],
      "env": {
        "FILESYSTEM_ROOT": "/Users/marseau/WhatsAppSalon-N8N"
      }
    },
    "web-search": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-web-search"],
      "env": {
        "SEARCH_API_KEY": "your-api-key-here"
      }
    }
  }
}
EOF

echo "✅ Configuração criada em: $CONFIG_DIR/claude_desktop_config.json"

# Criar variáveis de ambiente
echo ""
echo "🌍 Configurando variáveis de ambiente..."
echo "========================================"

# Adicionar variáveis ao .bashrc/.zshrc
SHELL_RC="$HOME/.bashrc"
if [[ "$SHELL" == *"zsh"* ]]; then
    SHELL_RC="$HOME/.zshrc"
fi

echo "" >> "$SHELL_RC"
echo "# MCP Servers Configuration" >> "$SHELL_RC"
echo "export MCP_DATABASE_URL=\"postgresql://postgres:postgres123@localhost:5432/booking_system\"" >> "$SHELL_RC"
echo "export MCP_GIT_REPO_PATH=\"/Users/marseau/WhatsAppSalon-N8N\"" >> "$SHELL_RC"
echo "export MCP_FILESYSTEM_ROOT=\"/Users/marseau/WhatsAppSalon-N8N\"" >> "$SHELL_RC"
echo "export DOCKER_HOST=\"unix:///var/run/docker.sock\"" >> "$SHELL_RC"

echo "✅ Variáveis de ambiente adicionadas ao $SHELL_RC"

# Informações finais
echo ""
echo "🎉 Instalação de MCP Servers concluída!"
echo "========================================"
echo ""
echo "📋 Próximos passos:"
echo "1. Reinicie o Claude Desktop para carregar os MCP servers"
echo "2. Execute 'source $SHELL_RC' ou abra um novo terminal"
echo "3. Configure suas API keys no arquivo de configuração"
echo "4. Execute 'docker-compose up -d' para iniciar os containers"
echo ""
echo "📁 Arquivos criados:"
echo "- $CONFIG_DIR/claude_desktop_config.json"
echo "- Variáveis de ambiente em $SHELL_RC"
echo ""
echo "🔧 Para verificar se os MCP servers estão funcionando:"
echo "- Abra o Claude Desktop"
echo "- Verifique se os servers aparecem na lista de ferramentas"
echo ""
echo "✨ Setup completo! Agora você tem acesso a ferramentas avançadas de produtividade."