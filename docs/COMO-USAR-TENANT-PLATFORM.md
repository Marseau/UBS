# Como Usar o Sistema Tenant-Platform Dashboard

## 🎯 **Visão Geral**

O Sistema Tenant-Platform Dashboard permite aos **Super Admins** visualizar como cada tenant contribui e participa na plataforma como um todo. É uma ferramenta poderosa para análise estratégica e gestão da plataforma SaaS.

## 🚀 **Como Acessar**

### Método 1: Via Dropdown (Recomendado)
1. **Fazer login** como Super Admin
2. **Acessar** o dashboard principal `/admin/dashboard`
3. **Localizar** o dropdown "Negócio" no topo da página
4. **Selecionar** um tenant específico (ex: "Salão de Beleza Bella Vista")
5. **Aguardar** o redirecionamento automático para o dashboard tenant-platform

### Método 2: Via URL Direta
1. **Navegar** diretamente para: `/admin/tenant-platform?tenantId=UUID_DO_TENANT`
2. **Substituir** `UUID_DO_TENANT` pelo ID do tenant desejado

## 📊 **Interface do Dashboard**

### 🏢 **Seção: Informações do Tenant**
```
┌─────────────────────────────────────────────────┐
│ 🏢 Salão de Beleza Bella Vista                   │
│ Domínio: beauty                                 │
│ 🏆 Posição: 2º de 10                            │
└─────────────────────────────────────────────────┘
```

### 🌐 **Seção: Contexto da Plataforma**
```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ R$ 150.000   │ 10 Tenants   │ 500 Agend.   │ 200 Clientes │
│ Receita      │ Ativos       │ Total        │ Total        │
│ Total        │              │              │              │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

### 📈 **Seção: Métricas de Participação**
```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ 12.5%          │ 14.2%          │ 10.8%          │ 15.6%          │
│ Participação   │ Participação   │ Participação   │ Participação   │
│ na Receita     │ Agendamentos   │ Clientes       │ IA             │
│ ↗ +2.3%        │ ↗ +1.8%        │ ↘ -0.5%        │ ↗ +3.1%        │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

## 📊 **Interpretação dos Gráficos**

### 1. **Evolução da Participação**
- **Tipo**: Gráfico de linha temporal
- **Mostra**: Como a participação do tenant evolui mês a mês
- **Linhas**: 
  - 🔵 Participação na Receita (%)
  - 🟢 Participação em Agendamentos (%)

**Interpretação:**
```
Se a linha está subindo = Tenant crescendo mais que a plataforma
Se a linha está descendo = Tenant crescendo menos que a plataforma
Se a linha está estável = Tenant crescendo no mesmo ritmo
```

### 2. **Distribuição de Serviços**
- **Tipo**: Gráfico de rosca (doughnut)
- **Mostra**: Como os serviços do tenant estão distribuídos
- **Dados**: Específicos do tenant, não comparativos

### 3. **Posição no Ranking**
- **Tipo**: Gráfico de barras
- **Mostra**: Evolução da posição do tenant no ranking geral
- **Interpretação**: Barra mais baixa = posição melhor (1º lugar)

### 4. **Contribuição vs Média**
- **Tipo**: Gráfico radar
- **Mostra**: Comparação entre tenant e média da plataforma
- **Linhas**:
  - 🔵 Este Tenant
  - ⚪ Média da Plataforma

## 🔍 **Casos de Uso Práticos**

### 📈 **Análise de Crescimento**
```
Cenário: Tenant com 12.5% de participação na receita
Pergunta: "Este tenant está crescendo?"

Análise:
1. Ver evolução temporal (gráfico de linha)
2. Verificar tendência (+2.3% = crescendo)
3. Comparar com outras métricas
4. Avaliar posição no ranking
```

### ⚠️ **Identificação de Riscos**
```
Cenário: Tenant com participação em declínio
Sinais de Alerta:
- Participação caindo mês a mês
- Tendência negativa (-2.5%)
- Posição no ranking piorando
- Score de risco alto (> 60)
```

### 🎯 **Planejamento Estratégico**
```
Cenário: Balanceamento da plataforma
Análise:
- Verificar se há tenants dominantes (> 30%)
- Identificar dependência excessiva
- Planejar diversificação
- Monitorar concentração de receita
```

## 🔄 **Navegação**

### ↩️ **Voltando ao Dashboard Sistema**
1. **Clicar** no botão "Voltar ao Dashboard Sistema" (topo direito)
2. **Aguardar** redirecionamento automático
3. **Ver** notificação de confirmação
4. **Dropdown** será automaticamente resetado para "Todos os Negócios"

### 🔄 **Alternando entre Tenants**
Para ver outro tenant:
1. **Voltar** ao dashboard sistema
2. **Selecionar** outro tenant no dropdown
3. **Será redirecionado** automaticamente

## 📋 **Fluxo de Trabalho Recomendado**

### 1. **Análise Diária** (5 min)
```
1. Acessar dashboard sistema
2. Ver overview geral da plataforma
3. Identificar tenant com maior variação
4. Clicar no tenant para análise detalhada
5. Verificar métricas de participação
6. Voltar ao dashboard sistema
```

### 2. **Análise Semanal** (15 min)
```
1. Revisar top 3 tenants por receita
2. Analisar evolução de cada um
3. Verificar mudanças no ranking
4. Identificar tendências de crescimento
5. Documentar insights
```

### 3. **Análise Mensal** (30 min)
```
1. Análise completa de todos os tenants
2. Comparação mês anterior
3. Identificação de riscos
4. Planejamento de ações
5. Relatório para stakeholders
```

## 💡 **Dicas e Boas Práticas**

### ✅ **Faça**
- **Monitore** tendências, não apenas valores absolutos
- **Compare** participação com crescimento próprio do tenant
- **Use** gráficos de evolução para detectar padrões
- **Documente** insights importantes
- **Analise** correlações entre métricas

### ❌ **Evite**
- **Focar** apenas em valores de um mês
- **Comparar** tenants de domínios diferentes sem contexto
- **Ignorar** tendências de longo prazo
- **Tomar decisões** baseadas em uma métrica apenas
- **Esquecer** de verificar contexto da plataforma

## 🚨 **Troubleshooting**

### ❓ **Problema: Dashboard não carrega**
```
Possíveis causas:
1. Tenant ID inválido na URL
2. Permissões insuficientes (não é Super Admin)
3. Tenant não existe ou foi desativado

Solução:
1. Verificar se é Super Admin
2. Voltar ao dashboard sistema
3. Selecionar tenant pelo dropdown
```

### ❓ **Problema: Dados não aparecem**
```
Possíveis causas:
1. Tenant sem dados no período
2. Problema na API
3. Dados ainda sendo calculados

Solução:
1. Verificar se tenant tem appointments/receita
2. Tentar período diferente
3. Verificar console do navegador
```

### ❓ **Problema: Percentuais parecem incorretos**
```
Possíveis causas:
1. Dados de plataforma desatualizados
2. Cálculos em períodos diferentes

Solução:
1. Verificar período selecionado
2. Comparar com dashboard sistema
3. Aguardar atualização de dados
```

## 📞 **Suporte**

Para problemas técnicos ou dúvidas:
1. **Verificar** logs do console do navegador
2. **Documentar** passos para reproduzir o problema
3. **Incluir** screenshot se necessário
4. **Reportar** o problema com detalhes

## 🔮 **Funcionalidades Futuras**

Em desenvolvimento:
- **Alertas automáticos** para mudanças significativas
- **Comparação** entre múltiplos tenants
- **Previsões** de tendências com IA
- **Exportação** de relatórios
- **Métricas personalizadas** por domínio

---

*Esta documentação é atualizada regularmente. Última atualização: Julho 2025*