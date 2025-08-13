# 📊 MAPA VISUAL DOS DASHBOARDS - UBS (Universal Booking System)

## 🏗️ ARQUITETURA GERAL

```
┌─────────────────────────────────────────────────────────────────┐
│                    UBS PLATFORM ARCHITECTURE                    │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐              ┌─────────────────┐           │
│  │   SUPER ADMIN   │◄────────────►│   TENANT ADMIN  │           │
│  │   DASHBOARD     │   SHARED     │   DASHBOARD     │           │
│  │  (Platform-wide)│   WIDGETS    │ (Single-tenant) │           │
│  └─────────────────┘              └─────────────────┘           │
│           │                                │                    │
│           ▼                                ▼                    │
│  ┌─────────────────┐              ┌─────────────────┐           │
│  │ Strategic KPIs  │              │Operational KPIs │           │
│  │ • MRR           │              │• Conversations  │           │
│  │ • Active Tenants│              │• Appointments   │           │
│  │ • Revenue Ratio │              │• Customers      │           │
│  │ • Efficiency    │              │• Services       │           │
│  └─────────────────┘              └─────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 SUPER ADMIN DASHBOARD

### 📋 Layout Principal (`dashboard-standardized.html`)

```
┌─────────────────────────────────────────────────────────────────┐
│ SIDEBAR                   │ MAIN CONTENT AREA                   │
├───────────────────────────┼─────────────────────────────────────┤
│ 🏢 UBS LOGO              │ ┌─── 8 STRATEGIC KPIs ROW ───┐      │
│                           │ │ MRR  │ActiveT│RevRatio│OpEff│      │
│ 📊 Dashboard              │ │$25.3K│  47   │  1.85  │94.2%│      │
│   ├ Super Admin Overview  │ │SpamR │TotalA │  AI    │CancR│      │
│   ├ System Analytics      │ │ 2.1% │ 1,247 │18,934 │8.7% │      │
│   └ Platform Metrics      │ └─────────────────────────────┘      │
│                           │                                     │
│ 🏢 Tenants Management     │ ┌─── CHARTS SECTION ───┐            │
│   ├ All Tenants          │ │┌─Revenue vs Usage─┐ ┌─Appointment─┐│
│   ├ Tenant Rankings       │ ││  Scatter Plot   │ │Status Donut││
│   └ Domain Analytics      │ ││                 │ │            ││
│                           │ │└─────────────────┘ └────────────┘│
│ 👤 Admin Users            │ └───────────────────────────────────┘
│   ├ Super Admins          │                                     │
│   ├ Tenant Admins         │ ┌─── INSIGHTS SECTION ───┐          │
│   └ Support Users         │ │┌─Distortion Analysis─┐            │
│                           │ ││Tenants paying >using││            │
│ 💰 Financial Overview     │ │└────────────────────┘            │
│   ├ Platform Revenue      │ │┌─Upsell Opportunities─┐          │
│   ├ Payment Status        │ ││Tenants using >paying ││          │
│   └ Billing Management    │ │└─────────────────────┘           │
│                           │ └───────────────────────────────────┘
│ ⚙️ System Management      │                                     │
│   ├ Health Monitoring     │ ┌─── TENANT RANKINGS ───┐           │
│   ├ Cron Jobs            │ │ Rank │Tenant │Revenue │Growth│     │
│   └ Analytics Scheduler   │ │  1   │Salon A│$2,340 │+15% │     │
│                           │ │  2   │Clinic │$1,890 │+22% │     │
│ 🔍 Advanced Analytics     │ │  3   │Legal X│$1,654 │+8%  │     │
│   ├ Business Intelligence │ └─────────────────────────────┘     │
│   ├ Tenant Comparisons    │                                     │
│   └ Growth Metrics        │                                     │
└───────────────────────────┴─────────────────────────────────────┘
```

### 🎨 Widgets Exclusivos Super Admin

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUPER ADMIN WIDGETS                          │
├─────────────────────────────────────────────────────────────────┤
│ 🔥 HEATMAP WIDGET                                               │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Tenant    │ Phone Numbers │ Status    │ Health Score       │ │
│ │ Beauty Co │ +5511999...   │ 🟢 Excellent │ 95/100           │ │
│ │ Law Firm  │ +5511888...   │ 🟡 Attention │ 72/100           │ │
│ │ Clinic Med│ +5511777...   │ 🔴 Critical  │ 45/100           │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ 📊 REVENUE vs USAGE SCATTER                                     │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │    Revenue (R$)                                             │ │
│ │ 3000│                            •Tenant A                 │ │
│ │     │              •Tenant C                               │ │
│ │ 2000│      •Tenant B                    •Tenant D         │ │
│ │     │                                                     │ │
│ │ 1000│  •Small        •Medium                              │ │
│ │     └─────────────────────────────────────► Usage         │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ 🎯 DISTORTION ANALYSIS                                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Tenants Paying MORE than Using (Upsell Protection)         │ │
│ │ • Beauty Salon Pro: Paying R$278, Using R$156 (-44%)      │ │
│ │ • Legal Partners: Paying R$111, Using R$67 (-40%)         │ │
│ │ • Health Clinic: Paying R$278, Using R$189 (-32%)         │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ 🚀 UPSELL OPPORTUNITIES                                         │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Tenants Using MORE than Paying (Revenue Growth)            │ │
│ │ • Dental Clinic: Paying R$111, Using R$245 (+121%)        │ │
│ │ • Fitness Center: Paying R$44, Using R$89 (+102%)         │ │
│ │ • Consulting Firm: Paying R$111, Using R$178 (+60%)       │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🏪 TENANT ADMIN DASHBOARD

### 📋 Layout Principal (`dashboard-tenant-admin.html`)

```
┌─────────────────────────────────────────────────────────────────┐
│ SIDEBAR                   │ MAIN CONTENT AREA                   │
├───────────────────────────┼─────────────────────────────────────┤
│ 🏢 UBS LOGO              │ ┌─── TODAY'S OVERVIEW ───┐           │
│                           │ │📅 Hoje: 15 agendamentos│           │
│ 📊 Dashboard              │ │💬 Conversas: 23        │           │
│   └ Visão Geral          │ │👥 Novos clientes: 4    │           │
│                           │ │💰 Receita: R$ 1,240   │           │
│ 🗓️ Operações             │ └─────────────────────────┘           │
│   ├ Agendamentos          │                                     │
│   ├ Clientes              │ ┌─── CONVERSATION USAGE ───┐         │
│   ├ Serviços              │ │ Plano: Profissional (400 conv)    │
│   └ Profissionais         │ │ ████████░░ 320/400 (80%)          │
│                           │ │ ⚠️ Próximo do upgrade automático   │
│ 💬 Comunicação            │ └───────────────────────────────────┘
│   └ Conversas WhatsApp    │                                     │
│                           │ ┌─── PERFORMANCE CHARTS ───┐        │
│ 📈 Analytics              │ │┌─Conv→Appt─┐ ┌─Receita/Serv─┐     │
│   └ Analytics Empresariais│ ││   85%     │ │              │     │
│                           │ ││   ████▒   │ │ ████▓▓▓▓     │     │
│ 💳 Financeiro             │ │└───────────┘ └──────────────┘     │
│   ├ Pagamentos            │ └───────────────────────────────────┘
│   └ Faturamento           │                                     │
│                           │ ┌─── RECENT CONVERSATIONS ───┐      │
│ ⚙️ Sistema                │ │ Cliente      │ Status │ IA Score │
│   └ Configurações         │ │ João Silva   │ 🟢 Ativo│   94%   │
│                           │ │ Maria Santos │ 🟡 Pendente│ 87%   │
│                           │ │ Pedro Lima   │ ✅ Resolvida│ 91% │
│                           │ └───────────────────────────────────┘
└───────────────────────────┴─────────────────────────────────────┘
```

### 🎨 Widgets Exclusivos Tenant Admin

```
┌─────────────────────────────────────────────────────────────────┐
│                    TENANT ADMIN WIDGETS                         │
├─────────────────────────────────────────────────────────────────┤
│ 💬 CONVERSATION USAGE WIDGET                                    │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Plano Atual: Profissional (R$ 111,20/mês)                  │ │
│ │ ████████░░ 320/400 conversas (80%)                         │ │
│ │                                                             │ │
│ │ ⚠️ Alerta: Próximo ao upgrade automático                    │ │
│ │ 📊 Excedente será cobrado a R$ 16,65/conversa              │ │
│ │ 📅 Renovação: 28/07/2025                                   │ │
│ │                                                             │ │
│ │ [Ver Detalhes] [Histórico] [Upgrade Manual]               │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ 📅 APPOINTMENT CALENDAR WIDGET                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │      JULHO 2025        │  HOJE - 28/07/2025                │ │
│ │ D  S  T  Q  Q  S  S   │                                   │ │
│ │       1  2  3  4  5   │ 09:00 - João Silva (Corte)       │ │
│ │ 6  7  8  9 10 11 12   │ 11:30 - Maria (Manicure)         │ │
│ │13 14 15 16 17 18 19   │ 14:00 - Pedro (Barba)            │ │
│ │20 21 22 23 24 25 26   │ 16:30 - Ana (Hidratação)         │ │
│ │27 [28]29 30 31        │ 18:00 - Carlos (Corte+Barba)     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ 📊 SERVICE PERFORMANCE WIDGET                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Serviço        │ Agendamentos │ Receita  │ Conversão        │ │
│ │ Corte Masculino│     45       │ R$ 1,350│ ████████░ 89%   │ │
│ │ Manicure       │     32       │ R$   960│ ███████░░ 76%   │ │
│ │ Hidratação     │     18       │ R$   900│ ██████░░░ 65%   │ │
│ │ Barba          │     23       │ R$   690│ ████████░ 82%   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ 👤 PROFESSIONAL ANALYTICS                                       │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ João (Barbeiro)    │ ████████░ 92% │ R$ 2,340 │ 34 agend. │ │
│ │ Maria (Manicure)   │ ███████░░ 78% │ R$ 1,560 │ 26 agend. │ │
│ │ Pedro (Esteticista)│ ██████░░░ 65% │ R$ 1,200 │ 18 agend. │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 TENANT BUSINESS ANALYTICS

### 📋 Layout Avançado (`tenant-business-analytics.html`)

```
┌─────────────────────────────────────────────────────────────────┐
│                TENANT BUSINESS ANALYTICS                        │
├─────────────────────────────────────────────────────────────────┤
│ ┌─── PLATFORM PARTICIPATION ───┐ ┌─── BUSINESS INTELLIGENCE ──┐ │
│ │ Revenue: 3.2% da plataforma   │ │ Health Score: 87/100       │ │
│ │ ████░░░░░░░░░░░░░░░░░░░░░░░░░  │ │ ████████░░                 │ │
│ │ R$ 2,340 de R$ 73,125 total   │ │                            │ │
│ │                               │ │ Risk Level: Baixo          │ │
│ │ Appointments: 4.1%            │ │ Growth Trend: +15%         │ │
│ │ ████░░░░░░░░░░░░░░░░░░░░░░░░░  │ │ Domain Rank: 3/12          │ │
│ │ 45 de 1,098 total             │ │                            │ │
│ └───────────────────────────────┘ └────────────────────────────┘ │
│                                                                 │
│ ┌─── CONVERSATION ANALYTICS ───┐ ┌─── DOMAIN COMPARISON ───┐    │
│ │ Avg Duration: 18.6 min        │ │     Beauty Domain         │    │
│ │ Quality Score: 94%            │ │ Your Performance: 87%     │    │
│ │ AI Interactions: 234          │ │ Domain Average: 82%       │    │
│ │ Spam Rate: 0% (0/234)         │ │ Top Performer: 95%        │    │
│ │                               │ │ Bottom: 65%               │    │
│ │ Conversion Rate: 89%          │ │ ████████▓░                │    │
│ │ Total Value: R$ 8,920         │ │ You ↑ 5% above average   │    │
│ └───────────────────────────────┘ └───────────────────────────┘    │
│                                                                 │
│ ┌─── OPERATIONAL EFFICIENCY ───┐ ┌─── REVENUE BREAKDOWN ───┐     │
│ │ Appointments/Conversations    │ │                          │     │
│ │ 45/89 = 50.6%                │ │ Services: R$ 2,100 (90%) │     │
│ │                               │ │ Products: R$ 180 (8%)    │     │
│ │ Customer Satisfaction         │ │ Other: R$ 60 (2%)        │     │
│ │ ████████░ 4.3/5.0            │ │                          │     │
│ │                               │ │ ████████▓░               │     │
│ │ Retention Rate: 78%           │ │ Growth: +15% vs último   │     │
│ │ ███████▓░░                   │ │ mês                      │     │
│ └───────────────────────────────┘ └──────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔗 SISTEMA DE APIs

### 🌐 Mapeamento de Endpoints

```
┌─────────────────────────────────────────────────────────────────┐
│                        API ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ SUPER ADMIN APIs                    TENANT ADMIN APIs           │
│ ┌─────────────────────┐            ┌─────────────────────┐     │
│ │ /api/super-admin/   │            │ /api/tenant-platform│     │
│ │ ├ kpis             │            │ ├ metrics/:id        │     │
│ │ ├ insights/        │            │ ├ participation      │     │
│ │ │ ├ distortion     │            │ └ comparison/:id     │     │
│ │ │ └ upsell         │            │                     │     │
│ │ ├ charts/          │            │ /api/tenant-business│     │
│ │ │ ├ revenue-usage  │            │ ├ metrics/:id        │     │
│ │ │ └ appointments   │            │ ├ platform-metrics   │     │
│ │ └ trigger-calc     │            │ └ top-tenants        │     │
│ └─────────────────────┘            └─────────────────────┘     │
│            │                                  │                │
│            └──────────┬──────────────────────┘                │
│                       │                                       │
│                 SHARED APIs                                   │
│              ┌─────────────────────┐                         │
│              │ /api/admin/         │                         │
│              │ ├ dashboard         │                         │
│              │ ├ analytics         │                         │
│              │ ├ conversations     │                         │
│              │ ├ export/*          │                         │
│              │ └ user-info         │                         │
│              │                     │                         │
│              │ /api/dashboard/     │                         │
│              │ ├ sistema/*         │                         │
│              │ ├ tenant/:id/*      │                         │
│              │ └ status            │                         │
│              └─────────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 FLUXO DE PERMISSÕES

### 🛡️ Sistema de Autenticação

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 1. LOGIN                                                        │
│ ┌─────────────────┐    JWT TOKEN    ┌─────────────────┐        │
│ │ User Credentials│ ──────────────► │ Admin Auth      │        │
│ │ email/password  │                 │ Middleware      │        │
│ └─────────────────┘                 └─────────────────┘        │
│                                             │                  │
│ 2. ROLE VERIFICATION                        ▼                  │
│ ┌─────────────────┐                 ┌─────────────────┐        │
│ │ JWT Payload:    │                 │ Role Check:     │        │
│ │ {               │                 │                 │        │
│ │   userId: 123   │◄────────────────│ • super_admin   │        │
│ │   role: "super" │                 │ • tenant_admin  │        │
│ │   tenantId: null│                 │ • support       │        │
│ │   permissions:[]│                 │                 │        │
│ │ }               │                 └─────────────────┘        │
│ └─────────────────┘                                            │
│                                                                 │
│ 3. DATA SCOPING                                                 │
│ ┌─────────────────┐                 ┌─────────────────┐        │
│ │ SUPER ADMIN     │                 │ TENANT ADMIN    │        │
│ │                 │                 │                 │        │
│ │ • All tenants   │                 │ • Single tenant │        │
│ │ • Platform KPIs │                 │ • RLS policies  │        │
│ │ • System mgmt   │                 │ • Scoped data   │        │
│ │ • Full access   │                 │ • Limited APIs  │        │
│ └─────────────────┘                 └─────────────────┘        │
│                                                                 │
│ 4. API ACCESS PATTERNS                                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ requireSuperAdmin    requireTenantAccess    verifyToken     │ │
│ │        │                     │                   │         │ │
│ │        ▼                     ▼                   ▼         │ │
│ │ Platform-wide          Single-tenant        Role-based    │ │
│ │ Full access           RLS filtered         Context dep.   │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📱 SISTEMA DE WIDGETS

### 🧩 Widget Factory Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       WIDGET ECOSYSTEM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ BASE WIDGET SYSTEM                                              │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ UBSWidget (Base Class)                                      │ │
│ │ ├ render()                                                  │ │
│ │ ├ update(data)                                              │ │
│ │ ├ destroy()                                                 │ │
│ │ └ generateId()                                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                           │                                     │
│                           ▼                                     │
│ SHARED WIDGETS (9)                                              │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ • MetricCardWidget    • ChartWidget      • TableWidget      │ │
│ │ • DoughnutChartWidget • SectionWidget    • FilterWidget     │ │
│ │ • ConversationsPanel  • DataUpdateInfo   • ErrorHandler     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│              │                                 │                │
│              ▼                                 ▼                │
│ SUPER ADMIN ONLY (5)                TENANT ADMIN ONLY (4)       │
│ ┌─────────────────────┐            ┌─────────────────────┐     │
│ │ • HeatmapWidget     │            │ • ConversationUsage │     │
│ │ • TenantRankings    │            │ • CalendarWidget    │     │
│ │ • DistortionAnalysis│            │ • ServicePerformance│     │
│ │ • UpsellOpportunity │            │ • ProfessionalAnalyt│     │
│ │ • RevenueScatter    │            │                     │     │
│ └─────────────────────┘            └─────────────────────┘     │
│                                                                 │
│ WIDGET LIFECYCLE                                                │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 1. Creation → 2. Registration → 3. Rendering → 4. Updates  │ │
│ │                                      ↓                     │ │
│ │ 8. Cleanup ← 7. Destroy ← 6. Error Handle ← 5. Auto-refresh│ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ AUTO-REFRESH PATTERNS                                           │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Super Admin: 10s intervals │ Tenant Admin: 30s intervals    │ │
│ │ • System health checks     │ • Business metrics updates     │ │
│ │ • Platform KPIs refresh    │ • Conversation usage tracking  │ │
│ │ • Tenant status monitoring │ • Appointment status updates   │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎨 DESIGN SYSTEM

### 🌈 UBS Visual Identity

```
┌─────────────────────────────────────────────────────────────────┐
│                        UBS DESIGN SYSTEM                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ COLOR PALETTE                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Primary:   #007bff (Blue)     │ Success:  #28a745 (Green)  │ │
│ │ Secondary: #6c757d (Gray)     │ Warning:  #ffc107 (Yellow) │ │
│ │ Danger:    #dc3545 (Red)      │ Info:     #17a2b8 (Cyan)   │ │
│ │ Light:     #f8f9fa (Gray-50)  │ Dark:     #343a40 (Gray-800)│ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ TYPOGRAPHY                                                      │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Font Family: Inter (300, 400, 500, 600, 700)               │ │
│ │ Headings: 700 weight, responsive sizing                    │ │
│ │ Body: 400 weight, 16px base, 1.5 line-height              │ │
│ │ Code: Monospace, 14px, background highlight                │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ COMPONENT LIBRARY                                               │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Framework: Bootstrap 5.3.0                                 │ │
│ │ Icons: Font Awesome 6.4.0                                  │ │
│ │ Charts: Chart.js with custom UBS theme                     │ │
│ │ Custom: ubs-standard-styles.css                            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ LAYOUT PATTERNS                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Sidebar: 280px fixed width, collapsible on mobile          │ │
│ │ Main: Fluid width with max-width containers                │ │
│ │ Grid: Bootstrap grid system (12 columns)                   │ │
│ │ Spacing: 8px base unit (0.5rem to 3rem scale)             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ RESPONSIVE BREAKPOINTS                                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Mobile: < 768px  │ Tablet: 768px-992px │ Desktop: > 992px  │ │
│ │ • Collapsed nav  │ • Condensed layout  │ • Full features   │ │
│ │ • Touch targets  │ • Hybrid interface  │ • Multi-column    │ │
│ │ • Single column  │ • Essential widgets │ • All widgets     │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 DATA FLOW

### 📊 Information Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         DATA FLOW DIAGRAM                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 1. USER AUTHENTICATION                                          │
│ ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│ │ Frontend Login  │───►│ JWT Generation  │───►│ Role Assignment │ │
│ │ email/password  │    │ + Token Signing │    │ + Permissions   │ │
│ └─────────────────┘    └─────────────────┘    └─────────────────┘ │
│                                                        │        │
│ 2. DASHBOARD RENDERING                                 ▼        │
│ ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│ │ Widget Factory  │◄───│ API Route Guard │◄───│ Permission Check│ │
│ │ Creates Widgets │    │ Validates Access│    │ Role-based      │ │
│ └─────────────────┘    └─────────────────┘    └─────────────────┘ │
│          │                                                      │
│          ▼                                                      │
│ 3. DATA FETCHING                                                │
│ ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│ │ API Endpoints   │───►│ Database Query  │───►│ Data Processing │ │
│ │ /super-admin/*  │    │ + RLS Policies  │    │ + Aggregation   │ │
│ │ /tenant/*       │    │ + Tenant Scope  │    │ + Formatting    │ │
│ └─────────────────┘    └─────────────────┘    └─────────────────┘ │
│                                                        │        │
│ 4. WIDGET UPDATES                                      ▼        │
│ ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│ │ Auto-refresh    │◄───│ State Management│◄───│ API Response    │ │
│ │ Timers (10s/30s)│    │ Widget States   │    │ JSON Data       │ │
│ └─────────────────┘    └─────────────────┘    └─────────────────┘ │
│                                                                 │
│ 5. ERROR HANDLING                                               │
│ ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│ │ Network Errors  │───►│ Error Handler   │───►│ User Feedback   │ │
│ │ API Failures    │    │ Retry Logic     │    │ Toast Messages  │ │
│ │ Permission Deny │    │ Fallback Data   │    │ Error States    │ │
│ └─────────────────┘    └─────────────────┘    └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 PERFORMANCE OPTIMIZATION

### ⚡ System Performance Map

```
┌─────────────────────────────────────────────────────────────────┐
│                    PERFORMANCE ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ CACHING LAYERS                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Level 1: Browser Cache (Static Assets)                     │ │
│ │ ├ CSS/JS files: 1 year                                     │ │
│ │ ├ Images: 6 months                                         │ │
│ │ └ HTML: No cache                                           │ │
│ │                                                             │ │
│ │ Level 2: API Response Cache                                 │ │
│ │ ├ Widget data: 30 seconds                                  │ │
│ │ ├ Chart data: 5 minutes                                    │ │
│ │ └ System metrics: 10 minutes                               │ │
│ │                                                             │ │
│ │ Level 3: Database Cache                                     │ │
│ │ ├ Materialized views: Daily refresh                        │ │
│ │ ├ Analytics cache: Hourly refresh                          │ │
│ │ └ Real-time data: No cache                                 │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ OPTIMIZATION STRATEGIES                                         │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Frontend:                                                   │ │
│ │ • Lazy loading widgets                                      │ │
│ │ • Image optimization (WebP)                                │ │
│ │ • Code splitting by role                                   │ │
│ │ • Debounced search/filters                                 │ │
│ │                                                             │ │
│ │ Backend:                                                    │ │
│ │ • Database connection pooling                              │ │
│ │ • Query optimization                                       │ │
│ │ • Background job processing                                │ │
│ │ • Rate limiting protection                                 │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ MONITORING                                                      │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Metrics Tracked:                                            │ │
│ │ • Page load times                                           │ │
│ │ • API response times                                        │ │
│ │ • Widget render times                                       │ │
│ │ • Database query performance                                │ │
│ │ • Memory usage                                              │ │
│ │ • Error rates                                               │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📱 MOBILE RESPONSIVENESS

### 📲 Mobile Layout Adaptations

```
┌─────────────────────────────────────────────────────────────────┐
│                      MOBILE ADAPTATIONS                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ MOBILE LAYOUT (< 768px)                                         │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ☰ HAMBURGER MENU           👤 USER PROFILE                 │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │                  🏢 UBS LOGO                                │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ ┌─── TODAY'S OVERVIEW ───┐                                  │ │
│ │ │ 📅 15 appointments     │                                  │ │
│ │ │ 💬 23 conversations    │                                  │ │
│ │ │ 👥 4 new customers     │                                  │ │
│ │ │ 💰 R$ 1,240 revenue    │                                  │ │
│ │ └────────────────────────┘                                  │ │
│ │                                                             │ │
│ │ ┌─── QUICK ACTIONS ───┐                                     │ │
│ │ │ [📅 Appointments]    │                                     │ │
│ │ │ [👥 Customers]       │                                     │ │
│ │ │ [💬 Conversations]   │                                     │ │
│ │ │ [📊 Analytics]       │                                     │ │
│ │ └─────────────────────┘                                     │ │
│ │                                                             │ │
│ │ ┌─── CRITICAL ALERTS ───┐                                   │ │
│ │ │ ⚠️ 5 pending appts     │                                   │ │
│ │ │ 🔄 2 rescheduled       │                                   │ │
│ │ │ 💬 3 new messages      │                                   │ │
│ │ └────────────────────────┘                                  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ TABLET LAYOUT (768px - 992px)                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ SIDEBAR (Collapsible)    │ MAIN CONTENT                     │ │
│ │ ├ Dashboard              │ ┌─── 4 KEY METRICS ───┐          │ │
│ │ ├ Operations             │ │ MRR │Active│Rev/Use│ Eff      │ │
│ │ ├ Analytics              │ └──────────────────────┘          │ │
│ │ └ Settings               │                                  │ │
│ │                          │ ┌─── COMPACT CHARTS ───┐        │ │
│ │                          │ │ Revenue Trend         │        │ │
│ │                          │ │ Status Distribution   │        │ │
│ │                          │ └───────────────────────┘        │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ TOUCH OPTIMIZATIONS                                             │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ • Minimum 44px touch targets                                │ │
│ │ • Swipe gestures for navigation                             │ │
│ │ • Pull-to-refresh functionality                             │ │
│ │ • Bottom navigation for key actions                         │ │
│ │ • Thumb-friendly button placement                           │ │
│ │ • Haptic feedback for interactions                          │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📈 FUTURE ROADMAP

### 🛣️ Evolution Path

```
┌─────────────────────────────────────────────────────────────────┐
│                       FUTURE ENHANCEMENTS                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ PHASE 1: Real-time Features (Q3 2025)                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ • WebSocket integration                                     │ │
│ │ • Live conversation updates                                 │ │
│ │ • Real-time appointment notifications                       │ │
│ │ • Push notifications system                                 │ │
│ │ • Live collaboration features                               │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ PHASE 2: Advanced Analytics (Q4 2025)                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ • Machine learning insights                                 │ │
│ │ • Predictive analytics                                      │ │
│ │ • Customer behavior analysis                                │ │
│ │ • Revenue forecasting                                       │ │
│ │ • Churn prediction                                          │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ PHASE 3: Mobile Apps (Q1 2026)                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ • Native iOS/Android apps                                   │ │
│ │ • Offline-first architecture                                │ │
│ │ • Push notifications                                        │ │
│ │ • Mobile-specific features                                  │ │
│ │ • QR code integrations                                      │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ PHASE 4: AI Enhancement (Q2 2026)                              │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ • Voice interface integration                               │ │
│ │ • Automated insights generation                             │ │
│ │ • Smart recommendations                                     │ │
│ │ • Natural language queries                                  │ │
│ │ • Automated report generation                               │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

*🎯 **Este mapa visual foi gerado pela análise completa dos dashboards UBS, incluindo arquivos HTML, widgets JavaScript, APIs TypeScript e sistema de permissões. Representa o estado atual (Jul 2025) da arquitetura frontend do WhatsApp Salon N8N.***