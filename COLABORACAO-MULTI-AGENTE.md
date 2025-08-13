# Guia de Colaboração Multi-Agente no WhatsAppSalon-N8N

## 🤝 Estratégia de Trabalho com Múltiplos Desenvolvedores

### 1. Estrutura de Branches por Responsabilidade

```bash
# Agente 1: Frontend e Dashboard
git worktree add ../WhatsAppSalon-frontend -b feature/dashboard-improvements
cd ../WhatsAppSalon-frontend
# Trabalha em: src/frontend/*, src/frontend/js/widgets/*

# Agente 2: Backend e APIs
git worktree add ../WhatsAppSalon-backend -b feature/api-optimization
cd ../WhatsAppSalon-backend
# Trabalha em: src/services/*, src/routes/*

# Agente 3: AI e Integrações
git worktree add ../WhatsAppSalon-ai -b feature/ai-enhancements
cd ../WhatsAppSalon-ai
# Trabalha em: src/services/agents/*, src/services/ai-testing.service.ts

# Agente 4: Database e Analytics
git worktree add ../WhatsAppSalon-database -b feature/analytics-optimization
cd ../WhatsAppSalon-database
# Trabalha em: database/*, src/services/analytics-*.ts
```

### 2. Divisão de Responsabilidades por Domínio

#### **Agente Frontend (UI/UX)**
```bash
# Responsável por:
- src/frontend/
- src/frontend/js/widgets/
- src/frontend/css/
- Testes E2E com Playwright

# Comandos específicos:
npm run build:frontend
npm run test:dashboard-ui
npm run test:e2e
```

#### **Agente Backend (APIs)**
```bash
# Responsável por:
- src/routes/
- src/middleware/
- src/services/api-*.ts
- Autenticação e segurança

# Comandos específicos:
npm run test:api-endpoints
npm run test:security
npm run lint:fix
```

#### **Agente AI (Inteligência Artificial)**
```bash
# Responsável por:
- src/services/agents/
- src/services/ai-*.service.ts
- src/services/function-calling/
- WhatsApp integração

# Comandos específicos:
npm run test:ai-full
npm run test:whatsapp
npm run test:multimodal
```

#### **Agente Database (Dados e Analytics)**
```bash
# Responsável por:
- database/
- src/services/analytics-*.ts
- src/services/saas-metrics.service.ts
- Otimização de queries

# Comandos específicos:
npm run db:migrate
npm run analytics:aggregate
npm run test:rls-security
```

### 3. Workflow de Colaboração

```bash
# 1. Cada agente cria seu worktree
git worktree add ../WhatsAppSalon-[seu-dominio] -b feature/[sua-feature]

# 2. Sincroniza com main regularmente
git fetch origin
git rebase origin/main

# 3. Comunica mudanças via commits descritivos
git commit -m "feat(frontend): adiciona widget de métricas em tempo real"
git commit -m "fix(ai): corrige timeout em conversas longas"
git commit -m "perf(database): otimiza query de analytics"

# 4. Push para branch remota
git push -u origin feature/[sua-feature]

# 5. Cria PR com template padrão
```

### 4. Convenções de Commit por Agente

```bash
# Frontend
feat(frontend): descrição
fix(ui): descrição
style(dashboard): descrição

# Backend
feat(api): descrição
fix(auth): descrição
perf(routes): descrição

# AI
feat(ai): descrição
fix(agents): descrição
test(whatsapp): descrição

# Database
feat(db): descrição
fix(analytics): descrição
perf(query): descrição
```

### 5. Evitando Conflitos

#### **Arquivos Compartilhados**
```bash
# package.json - coordenar adição de dependências
# .env.example - documentar novas variáveis
# CLAUDE.md - atualizar comandos e documentação
# src/index.ts - coordenar registro de rotas

# Estratégia: comunicar mudanças nesses arquivos no canal do time
```

#### **Áreas de Sobreposição**
```bash
# Frontend <-> Backend
- src/types/*.types.ts (coordenar tipos)
- API contracts (manter compatibilidade)

# Backend <-> Database
- Migrations (sequenciar corretamente)
- Query optimization (testar performance)

# AI <-> Backend
- Function calling (manter interfaces)
- Rate limiting (coordenar limites)
```

### 6. Scripts de Sincronização

```bash
#!/bin/bash
# sync-all-worktrees.sh

# Atualiza todos os worktrees com main
for worktree in $(git worktree list --porcelain | grep "worktree" | cut -d' ' -f2); do
    echo "Atualizando $worktree..."
    cd $worktree
    git fetch origin
    git rebase origin/main
done

# Verifica status de todos os worktrees
echo "\n=== Status de todos os worktrees ==="
git worktree list
```

### 7. Comunicação Entre Agentes

#### **Daily Sync**
```markdown
## Template Daily Sync

### Agente: [Nome]
**Branch:** feature/[nome]
**Progresso:**
- ✅ Implementado: [lista]
- 🚧 Em andamento: [lista]
- ⏳ Próximo: [lista]

**Bloqueios:**
- Preciso que [outro agente] termine [tarefa]

**PRs prontos para review:**
- #123 - [descrição]
```

#### **Canais de Comunicação**
1. **PR Comments**: Discussões técnicas específicas
2. **Issues**: Planejamento de features grandes
3. **CHANGELOG.md**: Registro de mudanças importantes
4. **Slack/Discord**: Comunicação rápida

### 8. Testes Integrados

```bash
# Cada agente roda testes do seu domínio + integração
# Frontend
npm run test:dashboard-full

# Backend
npm run test:api-endpoints
npm run test:security

# AI
npm run test:ai-full

# Database
npm run test:rls-security

# TODOS devem rodar antes do merge
npm run test:all
```

### 9. Deploy Coordenado

```bash
# 1. Merge de todas as features para staging
git checkout staging
git merge feature/dashboard-improvements
git merge feature/api-optimization
git merge feature/ai-enhancements
git merge feature/analytics-optimization

# 2. Deploy para staging
npm run deploy:staging

# 3. Testes de integração completos
npm run test:e2e:staging

# 4. Merge para main após aprovação
git checkout main
git merge staging

# 5. Deploy para produção
npm run deploy:production
```

### 10. Exemplo Prático: Nova Feature Multi-Agente

#### **Feature: Sistema de Notificações em Tempo Real**

```bash
# Agente Frontend
cd ../WhatsAppSalon-frontend
# Cria componente de notificações
# src/frontend/js/widgets/notification-widget.js

# Agente Backend
cd ../WhatsAppSalon-backend
# Cria API de notificações
# src/routes/notifications.ts
# src/services/notification.service.ts

# Agente AI
cd ../WhatsAppSalon-ai
# Integra notificações com eventos de AI
# src/services/agents/notification-triggers.ts

# Agente Database
cd ../WhatsAppSalon-database
# Cria tabela de notificações
# database/migrations/add-notifications-table.sql
```

### 11. Checklist de Merge

- [ ] Testes passando no domínio
- [ ] Testes de integração passando
- [ ] Documentação atualizada
- [ ] CLAUDE.md atualizado se necessário
- [ ] Sem conflitos com main
- [ ] Code review por pelo menos 1 agente
- [ ] Performance verificada
- [ ] Segurança validada

### 12. Comandos Úteis para Multi-Agente

```bash
# Ver o que cada agente está fazendo
git worktree list

# Ver branches ativas
git branch -a | grep feature/

# Ver últimos commits de cada agente
git log --all --oneline --graph --decorate -20

# Limpar worktrees após merge
git worktree prune

# Criar alias úteis
git config --global alias.wt 'worktree'
git config --global alias.wtl 'worktree list'
git config --global alias.wta 'worktree add'
git config --global alias.wtr 'worktree remove'
```

## 🚀 Benefícios da Abordagem Multi-Agente

1. **Desenvolvimento Paralelo**: 4x mais velocidade
2. **Menos Conflitos**: Cada um no seu domínio
3. **Especialização**: Cada agente expert na sua área
4. **Qualidade**: Code review cruzado
5. **Flexibilidade**: Fácil adicionar/remover agentes

## ⚠️ Cuidados Importantes

1. **Sempre sincronizar com main antes de começar o dia**
2. **Comunicar mudanças em arquivos compartilhados**
3. **Manter testes atualizados**
4. **Documentar decisões arquiteturais**
5. **Fazer commits frequentes e descritivos**