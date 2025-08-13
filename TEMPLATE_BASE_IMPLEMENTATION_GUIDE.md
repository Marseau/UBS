# 🎯 Guia de Implementação - Template Base UBS Dashboard

## 📋 Visão Geral

O `ubs-dashboard-base-template.html` é um template universal que pode ser usado para criar todas as páginas do dashboard UBS seguindo a padronização especificada no `WIDGET_STANDARDIZATION_PLAN.md`.

## ✅ **Análise do `dashbasico-standardized.html`**

**SIM, está completamente dentro da padronização:**
- ✅ Sistema de Widgets UBS
- ✅ Estrutura CSS consistente  
- ✅ JavaScript padronizado
- ✅ Layout responsivo
- ✅ Design premium [[memory:2328341]]

## 🎨 **Principais Melhorias Implementadas**

### 1. **Logo do App Substituído**
```html
<!-- ANTES: Ícone genérico -->
<i class="fas fa-cube me-2"></i>

<!-- DEPOIS: Logo oficial UBS -->
<img src="assets/images/optimized/Logo_Int_Branco.webp" alt="UBS Logo" id="logoImage">
```

### 2. **Sistema de Navegação Responsivo**
- **Desktop**: Logo grande (120x60px)
- **Collapsed**: Logo pequeno (40x40px)  
- **Mobile**: Logo mantém proporção

### 3. **Estrutura Modular Completa**
- **Sidebar**: Todas as seções do menu conforme especificado
- **Template Variables**: `{{PAGE_TITLE}}`, `{{PAGE_DESCRIPTION}}`, `{{PAGE_TYPE}}`
- **Widget System**: Integração completa com DashboardWidgetSystem

## 🚀 **Como Usar o Template Base**

### **Passo 1: Copiar Template Base**
```bash
cp src/frontend/ubs-dashboard-base-template.html src/frontend/nova-pagina.html
```

### **Passo 2: Substituir Placeholders**
```html
<!-- Substituir no <title> e elementos -->
{{PAGE_TITLE}} → Nome da Página
{{PAGE_DESCRIPTION}} → Descrição específica  
{{PAGE_TYPE}} → appointments, customers, services, etc.
```

### **Passo 3: Implementar Função Específica**
```javascript
// Sobrescrever a função initializePageContent()
async function initializePageContent() {
    const container = document.getElementById('contentContainer');
    
    try {
        const pageConfig = {
            layout: 'appointments', // ou customers, services, etc.
            sections: [
                {
                    id: 'filters-section',
                    title: 'Filtros de [Página]',
                    widgets: [
                        // Widgets específicos da página
                    ]
                }
                // Mais seções...
            ]
        };
        
        pageInstance = await createPageFromConfig(container, pageConfig);
        await loadPageData();
        
    } catch (error) {
        throw new Error(`Failed to initialize [page]: ${error.message}`);
    }
}
```

### **Passo 4: Adicionar Ações Específicas**
```javascript
// Adicionar botões específicos da página
const actionButtons = document.getElementById('actionButtons');
actionButtons.innerHTML += `
    <button class="btn btn-outline-success btn-action" onclick="novaFuncao()">
        <i class="fas fa-plus me-2"></i>Nova Ação
    </button>
`;
```

## 📁 **Estrutura de Páginas Recomendada**

### **Para cada segmento do sidebar:**

```
src/frontend/
├── ubs-dashboard-base-template.html     # ✅ Template base
├── dashboard-main.html                  # Visão Geral  
├── appointments-standardized.html       # ✅ Já implementado
├── customers-standardized.html          # ✅ Já implementado  
├── services-standardized.html           # ✅ Já implementado
├── conversations.html                   # Conversas WhatsApp
├── analytics-standardized.html          # ✅ Exemplo criado
├── payments-standardized.html           # ✅ Já implementado
├── billing.html                         # Faturamento
└── settings.html                        # Configurações
```

## 🎯 **Configuração por Tipo de Página**

### **1. Appointments (Agendamentos)**
```javascript
const appointmentsConfig = {
    layout: 'appointments',
    sections: [
        {
            id: 'filters-section',
            title: 'Filtros de Agendamentos',
            widgets: [
                {
                    type: 'filters',
                    config: {
                        filters: [
                            { type: 'date', id: 'date', label: 'Data' },
                            { type: 'select', id: 'status', label: 'Status' },
                            { type: 'select', id: 'service', label: 'Serviço' }
                        ]
                    }
                }
            ]
        },
        {
            id: 'metrics-section',
            title: 'Métricas de Agendamentos',
            widgets: [
                { type: 'metric-card', config: { title: 'Total Hoje', icon: 'fas fa-calendar-day' } },
                { type: 'metric-card', config: { title: 'Confirmados', icon: 'fas fa-check-circle' } },
                { type: 'metric-card', config: { title: 'Pendentes', icon: 'fas fa-clock' } },
                { type: 'metric-card', config: { title: 'Cancelados', icon: 'fas fa-times-circle' } }
            ]
        },
        {
            id: 'table-section',
            title: 'Lista de Agendamentos',
            widgets: [
                {
                    type: 'table',
                    config: {
                        columns: [
                            { key: 'time', label: 'Horário' },
                            { key: 'customer', label: 'Cliente' },
                            { key: 'service', label: 'Serviço' },
                            { key: 'status', label: 'Status' },
                            { key: 'actions', label: 'Ações' }
                        ]
                    }
                }
            ]
        }
    ]
};
```

### **2. Customers (Clientes)**
```javascript
const customersConfig = {
    layout: 'customers',
    sections: [
        {
            id: 'filters-section',
            title: 'Filtros de Clientes',
            widgets: [
                {
                    type: 'filters',
                    config: {
                        filters: [
                            { type: 'text', id: 'search', label: 'Buscar', placeholder: 'Nome ou telefone...' },
                            { type: 'select', id: 'segment', label: 'Segmento' },
                            { type: 'select', id: 'status', label: 'Status' }
                        ]
                    }
                }
            ]
        },
        {
            id: 'metrics-section',
            title: 'Métricas de Clientes',
            widgets: [
                { type: 'metric-card', config: { title: 'Total Clientes', icon: 'fas fa-users' } },
                { type: 'metric-card', config: { title: 'Novos (Mês)', icon: 'fas fa-user-plus' } },
                { type: 'metric-card', config: { title: 'Ativos', icon: 'fas fa-user-check' } },
                { type: 'metric-card', config: { title: 'LTV Médio', icon: 'fas fa-dollar-sign', format: 'currency' } }
            ]
        },
        {
            id: 'analytics-section',
            title: 'Análises de Clientes',
            widgets: [
                { type: 'chart', config: { title: 'Segmentação', chartType: 'doughnut' } },
                { type: 'chart', config: { title: 'Novos Clientes', chartType: 'line' } }
            ]
        }
    ]
};
```

### **3. Analytics (Análises)**
```javascript
const analyticsConfig = {
    layout: 'analytics',
    sections: [
        {
            id: 'kpis-section',
            title: 'Indicadores Principais',
            widgets: [
                { type: 'metric-card', config: { title: 'Receita Total', format: 'currency' } },
                { type: 'metric-card', config: { title: 'Agendamentos' } },
                { type: 'metric-card', config: { title: 'Ticket Médio', format: 'currency' } },
                { type: 'metric-card', config: { title: 'Taxa Conversão', format: 'percentage' } }
            ]
        },
        {
            id: 'charts-section',
            title: 'Análises Visuais',
            widgets: [
                { type: 'chart', config: { title: 'Tendência Receita', chartType: 'line' } },
                { type: 'chart', config: { title: 'Performance Serviços', chartType: 'doughnut' } },
                { type: 'chart', config: { title: 'Distribuição Horário', chartType: 'bar' } }
            ]
        }
    ]
};
```

## 🔧 **Funções Auxiliares Padrão**

### **createPageFromConfig()**
```javascript
async function createPageFromConfig(container, config) {
    const widgetSystem = new DashboardWidgetSystem();
    
    container.innerHTML = '';
    
    for (const section of config.sections) {
        const sectionElement = document.createElement('div');
        sectionElement.className = 'content-section widget-container';
        sectionElement.id = section.id;
        
        if (section.title) {
            const titleElement = document.createElement('h3');
            titleElement.innerHTML = `<i class="fas fa-${getIconForSection(section.id)} me-2"></i>${section.title}`;
            sectionElement.appendChild(titleElement);
        }
        
        const widgetsRow = document.createElement('div');
        widgetsRow.className = 'row g-3';
        
        for (const widgetConfig of section.widgets) {
            const widgetContainer = document.createElement('div');
            widgetContainer.className = widgetConfig.config.size || 'col-12';
            
            const widget = await widgetSystem.createWidget(widgetConfig.type, widgetConfig.id, widgetConfig.config);
            if (widget) {
                widgetContainer.appendChild(widget.element);
                widgetsRow.appendChild(widgetContainer);
            }
        }
        
        sectionElement.appendChild(widgetsRow);
        container.appendChild(sectionElement);
    }
    
    return {
        widgetSystem,
        config,
        updateMetric: (id, data) => widgetSystem.updateWidget(id, data),
        updateChart: (id, data) => widgetSystem.updateWidget(id, data),
        updateTable: (id, data) => widgetSystem.updateWidget(id, data)
    };
}
```

### **getIconForSection()**
```javascript
function getIconForSection(sectionId) {
    const iconMap = {
        'filters-section': 'filter',
        'metrics-section': 'chart-bar',
        'analytics-section': 'chart-line',
        'table-section': 'table',
        'kpis-section': 'tachometer-alt',
        'charts-section': 'chart-pie'
    };
    return iconMap[sectionId] || 'cog';
}
```

## 📱 **Responsividade e Mobile**

### **Breakpoints Padrão:**
```css
/* Mobile First */
@media (max-width: 768px) {
    .sidebar { transform: translateX(-100%); }
    .main-content { margin-left: 0; }
    .action-buttons { flex-direction: column; }
    .btn-action { width: 100%; }
}

/* Tablet */
@media (min-width: 769px) and (max-width: 992px) {
    .sidebar { width: 260px; }
    .main-content { margin-left: 260px; }
}

/* Desktop */
@media (min-width: 993px) {
    .sidebar { width: 280px; }
    .main-content { margin-left: 280px; }
}
```

## 🎨 **Customização de Cores e Temas**

### **Variáveis CSS Globais:**
```css
:root {
    --ubs-primary: #2D5A9B;
    --ubs-secondary: #F8F9FA;
    --ubs-success: #28A745;
    --ubs-warning: #FFC107;
    --ubs-danger: #DC3545;
    --ubs-info: #17A2B8;
    
    --ubs-border-radius: 8px;
    --ubs-shadow: 0 4px 20px rgba(45, 90, 155, 0.15);
    --ubs-transition: all 0.3s ease;
}
```

## 🚀 **Próximos Passos**

### **Implementação Recomendada:**

1. **✅ Usar o template base** para criar páginas restantes
2. **✅ Aplicar configurações específicas** para cada segmento  
3. **✅ Testar responsividade** em todos os dispositivos
4. **✅ Validar acessibilidade** e navegação por teclado
5. **✅ Implementar testes automatizados** para cada página

### **Páginas Prioritárias:**
1. **settings.html** - Configurações do sistema
2. **billing.html** - Faturamento e relatórios
3. **dashboard-main.html** - Visão geral principal

## 📊 **Benefícios da Padronização**

- **✅ Consistência Visual**: Interface uniforme em todo o app
- **✅ Manutenibilidade**: Código reutilizável e modular  
- **✅ Performance**: Widgets otimizados e padronizados
- **✅ Escalabilidade**: Fácil adição de novas funcionalidades
- **✅ Developer Experience**: Sistema claro e documentado
- **✅ User Experience**: Interface familiar e intuitiva

---

**Status**: ✅ **Template Base Criado e Testado**  
**Exemplo**: ✅ **analytics-standardized.html implementado**  
**Próximo**: 🔧 **Implementar páginas restantes usando o template** 