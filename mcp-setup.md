# 🔧 MCP Servers Setup para Produtividade

## 📋 MCP Servers Recomendados

### 1. **Database MCP Server**
```bash
# Instalar MCP Database Server
npm install -g @modelcontextprotocol/server-database

# Configuração para PostgreSQL
export MCP_DATABASE_URL="postgresql://postgres:postgres123@localhost:5432/booking_system"
```

### 2. **Docker MCP Server**
```bash
# Instalar MCP Docker Server
npm install -g @modelcontextprotocol/server-docker

# Permite gerenciar containers via MCP
export DOCKER_HOST="unix:///var/run/docker.sock"
```

### 3. **Git MCP Server**
```bash
# Instalar MCP Git Server
npm install -g @modelcontextprotocol/server-git

# Configuração para repositório
export MCP_GIT_REPO_PATH="/Users/marseau/WhatsAppSalon-N8N"
```

### 4. **Filesystem MCP Server**
```bash
# Instalar MCP Filesystem Server
npm install -g @modelcontextprotocol/server-filesystem

# Acesso ao sistema de arquivos
export MCP_FILESYSTEM_ROOT="/Users/marseau/WhatsAppSalon-N8N"
```

### 5. **Web Search MCP Server**
```bash
# Instalar MCP Web Search Server
npm install -g @modelcontextprotocol/server-web-search

# Para pesquisas e documentação
export MCP_SEARCH_API_KEY="your-search-api-key"
```

## 🚀 Script de Instalação Automática

```bash
#!/bin/bash
# install-mcp-servers.sh

echo "🔧 Instalando MCP Servers para Produtividade..."

# Atualizar npm
npm install -g npm@latest

# Instalar MCP Servers
echo "📦 Instalando Database Server..."
npm install -g @modelcontextprotocol/server-database

echo "🐳 Instalando Docker Server..."
npm install -g @modelcontextprotocol/server-docker

echo "📁 Instalando Git Server..."
npm install -g @modelcontextprotocol/server-git

echo "💾 Instalando Filesystem Server..."
npm install -g @modelcontextprotocol/server-filesystem

echo "🔍 Instalando Web Search Server..."
npm install -g @modelcontextprotocol/server-web-search

echo "📊 Instalando Analytics Server..."
npm install -g @modelcontextprotocol/server-analytics

echo "🔐 Instalando Security Server..."
npm install -g @modelcontextprotocol/server-security

echo "✅ Todos os MCP Servers instalados com sucesso!"

# Verificar instalações
echo "🔍 Verificando instalações..."
npx @modelcontextprotocol/server-database --version
npx @modelcontextprotocol/server-docker --version
npx @modelcontextprotocol/server-git --version

echo "🎉 Setup de MCP Servers concluído!"
```

## ⚙️ Configuração Claude Desktop

```json
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
        "SEARCH_API_KEY": "your-api-key"
      }
    }
  }
}
```

## 🎯 Benefícios dos MCP Servers

### **Database Server**
- Consultas SQL diretas
- Schema introspection
- Migrations automáticas
- Backup e restore

### **Docker Server** 
- Gerenciamento de containers
- Logs em tempo real
- Health checks
- Resource monitoring

### **Git Server**
- Commits automáticos
- Branch management
- Conflict resolution
- History analysis

### **Filesystem Server**
- File operations
- Directory scanning
- Permission management
- Backup automation

### **Web Search Server**
- Documentation lookup
- Stack Overflow integration
- Package discovery
- Security advisories

## 🔧 Comandos Úteis

```bash
# Iniciar todos os containers
docker-compose up -d

# Verificar status dos MCP servers
npx mcp list-servers

# Logs dos containers
docker-compose logs -f

# Rebuild da aplicação
docker-compose build --no-cache booking-api

# Cleanup completo
docker-compose down -v
docker system prune -a
```