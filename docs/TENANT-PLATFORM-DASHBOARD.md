# Tenant-Platform Dashboard System

## Visão Geral

O **Tenant-Platform Dashboard** é um sistema separado e dedicado que permite aos Super Admins visualizar como um tenant específico contribui e participa na plataforma como um todo. Diferente do dashboard regular que mostra métricas isoladas do tenant, este sistema foca na **participação percentual** e **contribuição relativa** do tenant em relação aos totais da plataforma.

## Arquitetura do Sistema

### 🎯 **Conceito Principal**

O sistema implementa **três cenários distintos de dashboard**:

1. **Dashboard Sistema** (Super Admin) - Métricas gerais da plataforma
2. **Dashboard Tenant** (Tenant Admin) - Métricas isoladas do tenant
3. **Dashboard Tenant-Platform** (Super Admin) - Participação do tenant na plataforma

### 📊 **Diferença Conceitual**

| Aspecto | Dashboard Regular | Dashboard Tenant-Platform |
|---------|------------------|---------------------------|
| **Público** | Tenant Admin | Super Admin |
| **Perspectiva** | Métricas isoladas | Participação na plataforma |
| **Receita** | R$ 5.000 do tenant | 10% da receita da plataforma |
| **Agendamentos** | 50 agendamentos | 8% dos agendamentos totais |
| **Clientes** | 20 clientes | 12% da base de clientes |
| **Crescimento** | +15% vs mês anterior | +2% de participação |

## Implementação Técnica

### 🏗️ **Estrutura de Arquivos**

```
src/
├── frontend/
│   ├── tenant-platform-dashboard.html     # Dashboard dedicado
│   └── js/
│       └── ubs-template-standardizer.js   # Widgets padrão
├── routes/
│   └── admin.js                          # Rotas API
├── services/
│   └── analytics.service.ts              # Lógica de negócio
├── database/
│   └── tenant-platform-metrics-schema.sql # Schema de tabelas
└── scripts/
    └── populate-tenant-platform-metrics.js # População de dados
```

### 🔌 **API Endpoints**

#### 1. Dashboard HTML
```http
GET /admin/tenant-platform?tenantId=uuid
```
- **Middleware**: `adminAuth.requireSuperAdmin`
- **Retorna**: HTML do dashboard tenant-platform
- **Acesso**: Apenas Super Admins

#### 2. API de Métricas
```http
GET /api/admin/tenant-platform/:tenantId?period=30d
```
- **Middleware**: `adminAuth.verifyToken`
- **Parâmetros**: 
  - `tenantId` (required): ID do tenant
  - `period` (optional): Período de análise (7d, 30d, 90d, 1y)
- **Retorna**: Métricas de participação estruturadas

### 📈 **Estrutura de Dados Retornada**

```typescript
{
  tenant: {
    id: string,
    name: string,
    domain: string,
    ranking: number,
    totalTenants: number
  },
  platformContext: {
    totalRevenue: number,
    totalTenants: number,
    totalAppointments: number,
    totalCustomers: number
  },
  participation: {
    revenue: {
      value: number,        // Valor do tenant
      percentage: number,   // % da plataforma
      trend: number        // Variação
    },
    appointments: { value, percentage, trend },
    customers: { value, percentage, trend },
    ai: { value, percentage, trend }
  },
  charts: {
    participationEvolution: {
      labels: string[],
      revenue: number[],
      appointments: number[]
    },
    servicesDistribution: {
      labels: string[],
      values: number[]
    },
    ranking: {
      labels: string[],
      positions: number[]
    },
    contribution: {
      labels: string[],
      tenantValues: number[],
      platformAverage: number[]
    }
  },
  ranking: {
    position: number,
    previousPosition: number,
    change: number,
    totalScore: number,
    // ... outros scores
  },
  riskAssessment: {
    score: number,
    status: string
  }
}
```

## Frontend Implementation

### 🎨 **Interface do Dashboard**

O dashboard é construído com **Bootstrap 5** e **Chart.js**, seguindo o padrão visual do sistema:

#### Header Section
```html
<div class="dashboard-header">
  <h1>Visão Tenant-Platform</h1>
  <p>Participação e contribuição na plataforma</p>
</div>
```

#### Tenant Information
```html
<div class="tenant-info">
  <h3 id="tenantName">Nome do Tenant</h3>
  <p id="tenantDomain">Domínio: beauty</p>
  <div class="ranking-position">
    <i class="fas fa-trophy"></i>
    Posição: 2º de 10
  </div>
</div>
```

#### Platform Context
```html
<div class="platform-context">
  <div class="row">
    <div class="col-md-3">
      <h4 id="platformTotalRevenue">R$ 150.000</h4>
      <small>Receita Total da Plataforma</small>
    </div>
    <!-- ... outros totais -->
  </div>
</div>
```

#### Participation Metrics
```html
<div class="participation-metrics">
  <div class="card stat-card">
    <div class="stat-value">12.5%</div>
    <div class="stat-label">Participação na Receita</div>
    <div class="metric-trend">
      <i class="fas fa-arrow-up trend-up"></i>
      <span>+2.3%</span>
    </div>
  </div>
</div>
```

### 📊 **Visualizações de Gráficos**

#### 1. Evolução da Participação
```javascript
new Chart(ctx, {
  type: 'line',
  data: {
    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
    datasets: [
      {
        label: 'Participação na Receita (%)',
        data: [8.5, 9.2, 10.1, 11.3, 10.8, 12.5],
        borderColor: '#2D5A9B'
      },
      {
        label: 'Participação em Agendamentos (%)',
        data: [12.3, 11.8, 13.2, 12.9, 13.5, 14.2],
        borderColor: '#28A745'
      }
    ]
  }
});
```

#### 2. Distribuição de Serviços
```javascript
new Chart(ctx, {
  type: 'doughnut',
  data: {
    labels: ['Corte', 'Coloração', 'Hidratação', 'Escova'],
    datasets: [{
      data: [45, 30, 15, 10],
      backgroundColor: ['#2D5A9B', '#28A745', '#FFC107', '#DC3545']
    }]
  }
});
```

#### 3. Ranking Position
```javascript
new Chart(ctx, {
  type: 'bar',
  data: {
    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
    datasets: [{
      label: 'Posição no Ranking',
      data: [4, 3, 2, 2, 1, 2],
      backgroundColor: '#FFC107'
    }]
  },
  options: {
    scales: {
      y: {
        reverse: true // Posição 1 no topo
      }
    }
  }
});
```

#### 4. Contribuição vs Média
```javascript
new Chart(ctx, {
  type: 'radar',
  data: {
    labels: ['Receita', 'Agendamentos', 'Clientes', 'IA'],
    datasets: [
      {
        label: 'Este Tenant',
        data: [12.5, 14.2, 10.8, 15.6],
        borderColor: '#2D5A9B'
      },
      {
        label: 'Média da Plataforma',
        data: [10, 10, 10, 10],
        borderColor: '#6C757D'
      }
    ]
  }
});
```

## Backend Implementation

### 🔧 **Analytics Service**

#### Método Principal
```typescript
async getTenantPlatformMetrics(tenantId: string, period: string = '30d'): Promise<any> {
  // 1. Obter dados do tenant
  const tenantData = await this.getTenantAnalytics(tenantId, period);
  
  // 2. Obter dados da plataforma
  const platformData = await this.getSystemDashboardData(period);
  
  // 3. Calcular participações
  const participation = {
    revenue: {
      value: tenantData.revenue?.total || 0,
      percentage: (tenantData.revenue?.total / platformData.totalRevenue) * 100,
      trend: tenantData.revenue?.growth || 0
    },
    // ... outros cálculos
  };
  
  // 4. Retornar estrutura completa
  return { tenant, platformContext, participation, charts, ranking };
}
```

#### Cálculos de Participação
```typescript
// Participação na receita
const revenueParticipation = platformTotal > 0 ? 
  (tenantValue / platformTotal) * 100 : 0;

// Participação em agendamentos
const appointmentsParticipation = platformAppointments > 0 ? 
  (tenantAppointments / platformAppointments) * 100 : 0;

// Participação em clientes
const customersParticipation = platformCustomers > 0 ? 
  (tenantCustomers / platformCustomers) * 100 : 0;
```

### 🗄️ **Database Schema**

O sistema inclui tabelas para métricas pré-calculadas:

#### tenant_platform_metrics
```sql
CREATE TABLE tenant_platform_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  metric_month DATE NOT NULL,
  
  -- Participação na receita
  platform_revenue_participation_pct DECIMAL(5,2) DEFAULT 0,
  tenant_revenue_value DECIMAL(12,2) DEFAULT 0,
  platform_total_revenue DECIMAL(12,2) DEFAULT 0,
  
  -- Participação em agendamentos
  platform_appointments_participation_pct DECIMAL(5,2) DEFAULT 0,
  tenant_appointments_count INTEGER DEFAULT 0,
  platform_total_appointments INTEGER DEFAULT 0,
  
  -- Ranking
  ranking_position INTEGER DEFAULT 0,
  total_tenants_in_ranking INTEGER DEFAULT 0,
  
  -- Risk assessment
  risk_score INTEGER DEFAULT 0,
  risk_status VARCHAR(20) DEFAULT 'Unknown',
  
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### tenant_platform_evolution
```sql
CREATE TABLE tenant_platform_evolution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  evolution_date DATE NOT NULL,
  
  -- Evolução da participação
  revenue_participation_pct DECIMAL(5,2) DEFAULT 0,
  appointments_participation_pct DECIMAL(5,2) DEFAULT 0,
  customers_participation_pct DECIMAL(5,2) DEFAULT 0,
  
  -- Variação vs mês anterior
  revenue_participation_change_pct DECIMAL(5,2) DEFAULT 0,
  appointments_participation_change_pct DECIMAL(5,2) DEFAULT 0,
  
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### tenant_platform_ranking
```sql
CREATE TABLE tenant_platform_ranking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ranking_date DATE NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  
  position INTEGER NOT NULL,
  previous_position INTEGER DEFAULT 0,
  position_change INTEGER DEFAULT 0,
  
  -- Critérios de ranking
  total_score DECIMAL(8,2) DEFAULT 0,
  revenue_score DECIMAL(8,2) DEFAULT 0,
  appointments_score DECIMAL(8,2) DEFAULT 0,
  growth_score DECIMAL(8,2) DEFAULT 0,
  engagement_score DECIMAL(8,2) DEFAULT 0,
  
  total_tenants INTEGER DEFAULT 0,
  percentile DECIMAL(5,2) DEFAULT 0,
  
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Sistema de População de Dados

### 🔄 **Script de População**

O script `populate-tenant-platform-metrics.js` é responsável por calcular e armazenar as métricas:

```javascript
class TenantPlatformMetricsPopulator {
  async populateAll() {
    // 1. Popula contexto da plataforma
    await this.populatePlatformContextMetrics();
    
    // 2. Popula métricas dos tenants
    await this.populateTenantPlatformMetrics();
    
    // 3. Popula evolução histórica
    await this.populateTenantPlatformEvolution();
    
    // 4. Popula ranking
    await this.populateTenantPlatformRanking();
    
    // 5. Popula distribuição de serviços
    await this.populateTenantServicesDistribution();
  }
}
```

### ⚙️ **Cron Job Configuration**

Para manter os dados atualizados:

```bash
# Executar diariamente às 02:00
0 2 * * * node /path/to/scripts/populate-tenant-platform-metrics.js

# Executar semanalmente para análise completa
0 3 * * 0 node /path/to/scripts/populate-tenant-platform-metrics.js --full
```

## Guia de Uso

### 🚀 **Acesso ao Dashboard**

1. **Login como Super Admin**
2. **Navegar para**: `/admin/tenant-platform?tenantId=UUID`
3. **Visualizar**:
   - Contexto da plataforma
   - Participação do tenant
   - Evolução temporal
   - Ranking e posição
   - Distribuição de serviços

### 📊 **Interpretação de Métricas**

#### Participação na Receita
```
Tenant: R$ 12.500 (12.5% da plataforma)
Plataforma: R$ 100.000 total
Tendência: +2.3% vs mês anterior
```

#### Participação em Agendamentos
```
Tenant: 85 agendamentos (14.2% da plataforma)
Plataforma: 600 agendamentos total
Tendência: +1.8% vs mês anterior
```

#### Ranking
```
Posição: 2º de 10 tenants
Percentil: 80% (top 20%)
Variação: +1 posição vs mês anterior
```

### 🎯 **Casos de Uso**

#### 1. Análise de Performance
- Identificar tenants com maior participação
- Acompanhar evolução de participação
- Comparar com média da plataforma

#### 2. Gestão de Riscos
- Monitorar tenants com baixa participação
- Identificar tendências de declínio
- Avaliar impacto de churn

#### 3. Estratégia de Crescimento
- Identificar oportunidades de expansão
- Analisar balanceamento da plataforma
- Planejar alocação de recursos

## Segurança e Permissões

### 🔒 **Controle de Acesso**

```typescript
// Middleware de autenticação
router.get('/tenant-platform', adminAuth.requireSuperAdmin, (req, res) => {
  // Apenas Super Admins podem acessar
});

// API de métricas
router.get('/api/admin/tenant-platform/:tenantId', adminAuth.verifyToken, (req, res) => {
  // Verificação adicional de permissões
  if (req.admin.role !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
});
```

### 🛡️ **Validações**

```typescript
// Validação de tenant ID
if (!tenantId || !isValidUUID(tenantId)) {
  return res.status(400).json({ error: 'Invalid tenant ID' });
}

// Validação de período
const validPeriods = ['7d', '30d', '90d', '1y'];
if (!validPeriods.includes(period)) {
  return res.status(400).json({ error: 'Invalid period' });
}
```

## Performance e Otimização

### ⚡ **Estratégias de Performance**

#### 1. Dados Pré-calculados
```sql
-- Índices para performance
CREATE INDEX idx_tenant_platform_metrics_tenant_id 
ON tenant_platform_metrics(tenant_id);

CREATE INDEX idx_tenant_platform_metrics_month 
ON tenant_platform_metrics(metric_month);
```

#### 2. Cache de Resultados
```javascript
// Cache em memória para dados frequentemente acessados
const cache = new Map();
const cacheKey = `tenant_platform_${tenantId}_${period}`;

if (cache.has(cacheKey)) {
  return cache.get(cacheKey);
}
```

#### 3. Queries Paralelas
```typescript
// Executar consultas em paralelo
const [tenantData, platformData] = await Promise.all([
  this.getTenantAnalytics(tenantId, period),
  this.getSystemDashboardData(period)
]);
```

## Monitoramento e Logs

### 📝 **Logging**

```typescript
// Logs estruturados
console.log('📊 Tenant Platform Metrics Request', {
  tenantId,
  period,
  timestamp: new Date().toISOString(),
  userRole: req.admin.role
});

// Logs de performance
const startTime = Date.now();
const result = await this.getTenantPlatformMetrics(tenantId, period);
const duration = Date.now() - startTime;

console.log('⚡ Performance Metrics', {
  method: 'getTenantPlatformMetrics',
  duration,
  tenantId
});
```

### 📊 **Métricas de Uso**

```typescript
// Tracking de uso do dashboard
const usageMetrics = {
  endpoint: '/api/admin/tenant-platform',
  tenant: tenantId,
  user: req.admin.id,
  timestamp: new Date(),
  responseTime: duration
};

await this.trackUsage(usageMetrics);
```

## Troubleshooting

### 🐛 **Problemas Comuns**

#### 1. Dados Não Aparecem
```bash
# Verificar se as tabelas existem
npm run db:migrate

# Verificar se há dados populados
node scripts/populate-tenant-platform-metrics.js
```

#### 2. Percentuais Incorretos
```javascript
// Verificar se os totais da plataforma estão corretos
const platformTotal = await this.getSystemDashboardData(period);
console.log('Platform totals:', platformTotal);

// Verificar se o tenant tem dados
const tenantData = await this.getTenantAnalytics(tenantId, period);
console.log('Tenant data:', tenantData);
```

#### 3. Gráficos Não Carregam
```javascript
// Verificar estrutura dos dados
console.log('Chart data structure:', JSON.stringify(chartData, null, 2));

// Verificar se Chart.js está carregado
if (typeof Chart === 'undefined') {
  console.error('Chart.js not loaded');
}
```

### 🔧 **Debug Mode**

```javascript
// Ativar debug no frontend
const dashboard = new TenantPlatformDashboard();
dashboard.debugMode = true;

// Logs detalhados no backend
process.env.DEBUG_TENANT_PLATFORM = 'true';
```

## Extensibilidade

### 🔮 **Futuras Melhorias**

#### 1. Alertas Automáticos
```typescript
// Sistema de alertas para mudanças significativas
if (participation.revenue.trend < -5) {
  await this.createAlert({
    type: 'revenue_drop',
    tenant: tenantId,
    severity: 'warning',
    message: 'Participação na receita caiu mais de 5%'
  });
}
```

#### 2. Comparação entre Tenants
```typescript
// Comparar múltiplos tenants
async getTenantComparison(tenantIds: string[], period: string) {
  const comparisons = await Promise.all(
    tenantIds.map(id => this.getTenantPlatformMetrics(id, period))
  );
  
  return this.buildComparisonChart(comparisons);
}
```

#### 3. Previsões e Tendências
```typescript
// Usar machine learning para prever tendências
async predictTenantParticipation(tenantId: string) {
  const historicalData = await this.getHistoricalParticipation(tenantId);
  return this.mlService.predict(historicalData);
}
```

## Conclusão

O **Tenant-Platform Dashboard** representa uma solução completa para visualização de participação e contribuição de tenants na plataforma. Com arquitetura separada, APIs dedicadas e visualizações especializadas, o sistema oferece insights valiosos para gestão estratégica da plataforma SaaS multi-tenant.

O sistema está preparado para escalar com o crescimento da plataforma, incluindo otimizações de performance, segurança robusta e extensibilidade para futuras funcionalidades.