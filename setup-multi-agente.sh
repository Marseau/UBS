#!/bin/bash
# Setup para trabalho multi-agente no WhatsAppSalon-N8N

echo "🚀 Configurando ambiente multi-agente..."

# Cores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. Criar estrutura de worktrees
echo -e "${BLUE}Criando worktrees para cada agente...${NC}"

# Agente Frontend
if [ ! -d "../WhatsAppSalon-frontend" ]; then
    git worktree add ../WhatsAppSalon-frontend -b feature/dashboard-improvements
    echo -e "${GREEN}✓ Worktree Frontend criado${NC}"
fi

# Agente Backend
if [ ! -d "../WhatsAppSalon-backend" ]; then
    git worktree add ../WhatsAppSalon-backend -b feature/api-optimization
    echo -e "${GREEN}✓ Worktree Backend criado${NC}"
fi

# Agente AI
if [ ! -d "../WhatsAppSalon-ai" ]; then
    git worktree add ../WhatsAppSalon-ai -b feature/ai-enhancements
    echo -e "${GREEN}✓ Worktree AI criado${NC}"
fi

# Agente Database
if [ ! -d "../WhatsAppSalon-database" ]; then
    git worktree add ../WhatsAppSalon-database -b feature/analytics-optimization
    echo -e "${GREEN}✓ Worktree Database criado${NC}"
fi

# 2. Instalar dependências em cada worktree
echo -e "\n${BLUE}Instalando dependências...${NC}"

for dir in ../WhatsAppSalon-frontend ../WhatsAppSalon-backend ../WhatsAppSalon-ai ../WhatsAppSalon-database; do
    if [ -d "$dir" ]; then
        echo -e "${YELLOW}Instalando em $dir...${NC}"
        cd "$dir"
        npm install
        cd - > /dev/null
    fi
done

# 3. Criar arquivo de status
echo -e "\n${BLUE}Criando arquivo de status compartilhado...${NC}"

cat > ../agentes-status.md << 'EOF'
# Status dos Agentes - WhatsAppSalon

## 🤖 Agentes Ativos

### Frontend (UI/UX)
- **Branch:** feature/dashboard-improvements
- **Diretório:** ../WhatsAppSalon-frontend
- **Status:** 🟢 Ativo
- **Última atualização:** $(date)

### Backend (APIs)
- **Branch:** feature/api-optimization
- **Diretório:** ../WhatsAppSalon-backend
- **Status:** 🟢 Ativo
- **Última atualização:** $(date)

### AI (Inteligência Artificial)
- **Branch:** feature/ai-enhancements
- **Diretório:** ../WhatsAppSalon-ai
- **Status:** 🟢 Ativo
- **Última atualização:** $(date)

### Database (Analytics)
- **Branch:** feature/analytics-optimization
- **Diretório:** ../WhatsAppSalon-database
- **Status:** 🟢 Ativo
- **Última atualização:** $(date)

## 📋 Tarefas em Andamento

### Frontend
- [ ] Implementar novo dashboard widget system
- [ ] Otimizar performance do super-admin-dashboard
- [ ] Adicionar testes E2E para fluxo de onboarding

### Backend
- [ ] Refatorar sistema de autenticação
- [ ] Implementar cache para APIs pesadas
- [ ] Adicionar rate limiting granular

### AI
- [ ] Melhorar intent recognition
- [ ] Implementar novo domain agent (fitness)
- [ ] Otimizar uso de tokens OpenAI

### Database
- [ ] Implementar particionamento de tabelas grandes
- [ ] Otimizar queries do dashboard
- [ ] Adicionar índices para métricas

## 🔄 Últimas Integrações

- Nenhuma integração ainda

EOF

# 4. Criar scripts de utilidade
echo -e "\n${BLUE}Criando scripts de utilidade...${NC}"

# Script para sincronizar todos os worktrees
cat > sync-all-agents.sh << 'EOF'
#!/bin/bash
# Sincroniza todos os worktrees com main

echo "🔄 Sincronizando todos os agentes com main..."

for worktree in ../WhatsAppSalon-frontend ../WhatsAppSalon-backend ../WhatsAppSalon-ai ../WhatsAppSalon-database; do
    if [ -d "$worktree" ]; then
        echo "Atualizando $(basename $worktree)..."
        cd "$worktree"
        git fetch origin
        git rebase origin/main
        cd - > /dev/null
    fi
done

echo "✅ Sincronização completa!"
EOF

chmod +x sync-all-agents.sh

# Script para ver status de todos os agentes
cat > status-all-agents.sh << 'EOF'
#!/bin/bash
# Mostra status de todos os worktrees

echo "📊 Status de todos os agentes:"
echo "================================"

for worktree in ../WhatsAppSalon-frontend ../WhatsAppSalon-backend ../WhatsAppSalon-ai ../WhatsAppSalon-database; do
    if [ -d "$worktree" ]; then
        echo -e "\n🤖 $(basename $worktree):"
        cd "$worktree"
        git status -s
        cd - > /dev/null
    fi
done

echo -e "\n================================"
git worktree list
EOF

chmod +x status-all-agents.sh

# 5. Configurar git aliases
echo -e "\n${BLUE}Configurando git aliases...${NC}"

git config --global alias.wt 'worktree'
git config --global alias.wtl 'worktree list'
git config --global alias.wta 'worktree add'
git config --global alias.wtr 'worktree remove'
git config --global alias.sync-all '!bash sync-all-agents.sh'
git config --global alias.status-all '!bash status-all-agents.sh'

# 6. Mostrar resumo
echo -e "\n${GREEN}✅ Configuração multi-agente completa!${NC}"
echo -e "\n${YELLOW}Worktrees criados:${NC}"
git worktree list

echo -e "\n${YELLOW}Comandos disponíveis:${NC}"
echo "  ./sync-all-agents.sh    - Sincroniza todos os agentes com main"
echo "  ./status-all-agents.sh  - Mostra status de todos os agentes"
echo "  git wtl                 - Lista todos os worktrees"
echo "  git sync-all            - Alias para sincronizar todos"
echo "  git status-all          - Alias para ver status de todos"

echo -e "\n${YELLOW}Próximos passos:${NC}"
echo "1. Cada agente deve trabalhar em seu diretório específico"
echo "2. Use 'cd ../WhatsAppSalon-[dominio]' para mudar de contexto"
echo "3. Sincronize regularmente com './sync-all-agents.sh'"
echo "4. Consulte COLABORACAO-MULTI-AGENTE.md para guia completo"