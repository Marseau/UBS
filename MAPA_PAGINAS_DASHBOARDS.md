# 🗺️ MAPA DE PÁGINAS DOS DASHBOARDS UBS

## 🏢 SUPER ADMIN (Dono da Plataforma)

### **Dashboard Principal**
```
🏠 dashboard-standardized.html
   └─ Dashboard Super Admin - visão geral de tudo
```

### **Gerenciamento de Negócios**
```
🏪 tenants-standardized.html
   └─ Lista todos os salões/clínicas da plataforma
   └─ Pode criar, editar, suspender negócios
```

### **Analytics Globais**
```
📊 appointments-standardized-admin.html
   └─ Todos os agendamentos de todos os negócios
   
👥 customers-standardized-admin.html
   └─ Todos os clientes de todos os negócios
   
✂️ services-standardized-admin.html
   └─ Todos os serviços oferecidos na plataforma
   
💬 conversations-standardized-admin.html
   └─ Todas as conversas WhatsApp da plataforma
```

### **Financeiro Global**
```
💳 payments-standardized.html
   └─ Todos os pagamentos da plataforma
   └─ Faturas de todos os negócios
```

---

## 💇 TENANT ADMIN (Dono do Salão/Clínica)

### **Dashboard Principal**
```
🏠 dashboard-tenant-admin.html
   └─ Visão geral do MEU negócio
   └─ Agendamentos de hoje, conversas, receita
```

### **Operações do Negócio**
```
📅 appointments-standardized.html
   └─ MEUS agendamentos
   └─ Calendário do meu salão

👥 customers-standardized.html
   └─ MEUS clientes
   └─ Histórico de cada cliente

👨‍💼 professionals-standardized.html
   └─ MEUS funcionários
   └─ Cabeleireiros, manicures, etc.

✂️ services-standardized.html
   └─ MEUS serviços
   └─ Corte, manicure, preços
```

### **Comunicação**
```
💬 conversations-standardized.html
   └─ MINHAS conversas WhatsApp
   └─ Histórico de mensagens dos meus clientes
```

### **Analytics do Negócio**
```
📊 analytics-standardized.html
   └─ Relatórios do MEU negócio
   
📈 tenant-business-analytics.html
   └─ Analytics avançados
   └─ Comparação com outros negócios
   └─ Score de performance
```

### **Financeiro**
```
💰 billing-standardized.html
   └─ MINHAS faturas
   └─ Quanto pago para usar a plataforma

💳 payments-standardized.html
   └─ MEUS pagamentos recebidos
   └─ Pagamentos dos meus clientes
```

### **Configurações**
```
⚙️ settings-standardized.html
   └─ Configurações do MEU negócio
   └─ Horários, dados, equipe
```

---

## 🔐 PÁGINAS DE LOGIN

### **Acesso ao Sistema**
```
🚪 login-standardized.html
   └─ Login único para todos
   └─ Sistema decide se é Super Admin ou Tenant Admin

📝 register-standardized.html
   └─ Registro de novos negócios
   └─ Cadastro de salões/clínicas

🔑 forgot-password.html
   └─ Recuperar senha por email
```

### **Página Inicial**
```
🌐 landing-standardized.html
   └─ Site público do UBS
   └─ Informações sobre a plataforma
```

---

## 📱 COMO FUNCIONA A NAVEGAÇÃO?

### **Super Admin vê este menu:**
```
📊 Dashboard
   ├─ Visão Geral da Plataforma
   
🏢 Negócios
   ├─ Todos os Salões/Clínicas
   ├─ Agendamentos de Todos
   ├─ Clientes de Todos  
   ├─ Serviços de Todos
   └─ Conversas de Todos
   
💰 Financeiro
   ├─ Pagamentos da Plataforma
   └─ Faturas dos Negócios
```

### **Tenant Admin vê este menu:**
```
📊 Dashboard
   ├─ Meu Salão/Clínica
   
🏪 Operações
   ├─ Meus Agendamentos
   ├─ Meus Clientes
   ├─ Meus Serviços
   └─ Meus Funcionários
   
💬 Comunicação
   └─ Minhas Conversas WhatsApp
   
📈 Analytics
   ├─ Relatórios do Negócio
   └─ Analytics Avançados
   
💰 Financeiro
   ├─ Minhas Faturas (que pago)
   └─ Meus Pagamentos (que recebo)
   
⚙️ Configurações
   └─ Dados do Negócio
```

---

## 🔄 FLUXO DE ACESSO

```
1. Usuário acessa: landing-standardized.html
   ↓
2. Clica em "Entrar": login-standardized.html
   ↓
3. Sistema verifica o tipo de usuário:
   ├─ Super Admin → dashboard-standardized.html (visão global)
   └─ Tenant Admin → dashboard-tenant-admin.html (visão do negócio)
   ↓
4. Navega pelas páginas específicas do seu nível
```

---

## 📋 RESUMO RÁPIDO

| **Tipo** | **Páginas Principais** | **O que Fazem** |
|----------|------------------------|-----------------|
| **Super Admin** | 6 páginas | Gerenciar TODA a plataforma |
| **Tenant Admin** | 9 páginas | Gerenciar MEU negócio |
| **Login** | 3 páginas | Entrar no sistema |
| **Total Ativas** | **18 páginas** | Sistema completo |

---

## 💡 DIFERENÇA PRÁTICA

### **Super Admin clica em "Agendamentos":**
→ Vê agendamentos de TODOS os salões (1.000+ agendamentos)

### **Tenant Admin clica em "Agendamentos":**
→ Vê agendamentos do SEU salão (15 agendamentos)

### **Super Admin clica em "Clientes":**
→ Vê TODOS os clientes de TODOS os negócios (5.000+ clientes)

### **Tenant Admin clica em "Clientes":**
→ Vê SEUS clientes (120 clientes)

---

*✨ **Resumo**: O Super Admin tem acesso a 6 páginas que mostram dados de TODA a plataforma, enquanto o Tenant Admin tem 9 páginas que mostram dados APENAS do seu negócio. É como ter duas "versões" do mesmo sistema!*