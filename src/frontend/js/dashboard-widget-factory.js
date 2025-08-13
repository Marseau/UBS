/**
 * UBS Dashboard Widget Factory
 * Factory class for creating dashboard widgets using the standardized system
 * 
 * @version 2.0.0
 * @author UBS Team
 */

class DashboardWidgetSystem {
    constructor() {
        this.widgets = new Map();
        this.widgetTypes = {
            'metric-card': this.createMetricCardWidget,
            'chart': this.createChartWidget,
            'table': this.createTableWidget,
            'filters': this.createFilterWidget,
            'conversations-panel': this.createConversationsPanelWidget,
            'section': this.createSectionWidget
        };
    }

    async createWidget(type, id, config) {
        console.log(`🔧 Creating widget: ${type} (${id})`);
        
        const createFunction = this.widgetTypes[type];
        if (!createFunction) {
            console.error(`Unknown widget type: ${type}`);
            return null;
        }

        try {
            const widget = await createFunction.call(this, id, config);
            this.widgets.set(id, widget);
            return widget;
        } catch (error) {
            console.error(`Error creating widget ${id}:`, error);
            return null;
        }
    }

    createMetricCardWidget(id, config) {
        const container = document.createElement('div');
        
        const widget = {
            id,
            type: 'metric-card',
            config,
            element: container,
            render: () => {
                container.innerHTML = `
                    <div class="card h-100 metric-card-widget" data-widget-id="${id}">
                        <div class="card-body text-center">
                            <div class="metric-icon mb-3">
                                <i class="${config.icon} fa-2x text-${config.color}"></i>
                            </div>
                            <h6 class="card-title text-muted mb-2">${config.title}</h6>
                            <h3 class="metric-value mb-0" id="${id}-value">
                                <div class="spinner-border spinner-border-sm" role="status">
                                    <span class="visually-hidden">Loading...</span>
                                </div>
                            </h3>
                            ${config.trend ? `
                                <small class="metric-trend text-muted" id="${id}-trend">
                                    <i class="fas fa-arrow-up"></i> 0%
                                </small>
                            ` : ''}
                        </div>
                    </div>
                `;
                return container;
            },
            update: (data) => {
                const valueElement = container.querySelector(`#${id}-value`);
                const trendElement = container.querySelector(`#${id}-trend`);
                
                if (valueElement) {
                    let formattedValue = data.value;
                    
                    if (config.format === 'currency') {
                        formattedValue = new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0
                        }).format(data.value);
                    } else if (config.format === 'percentage') {
                        formattedValue = `${data.value}%`;
                    } else if (typeof data.value === 'number') {
                        formattedValue = new Intl.NumberFormat('pt-BR').format(data.value);
                    }
                    
                    valueElement.textContent = formattedValue;
                }
                
                if (trendElement && data.trend) {
                    const isPositive = data.trend.direction === 'up';
                    const arrowClass = isPositive ? 'fa-arrow-up text-success' : 'fa-arrow-down text-danger';
                    trendElement.innerHTML = `<i class="fas ${arrowClass}"></i> ${data.trend.value}%`;
                }
            }
        };

        widget.render();
        return widget;
    }

    createChartWidget(id, config) {
        const container = document.createElement('div');
        
        const widget = {
            id,
            type: 'chart',
            config,
            element: container,
            chart: null,
            render: () => {
                container.innerHTML = `
                    <div class="card h-100 chart-widget" data-widget-id="${id}">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">${config.title}</h6>
                            <div class="chart-actions">
                                <button class="btn btn-sm btn-outline-secondary" onclick="refreshChart('${id}')">
                                    <i class="fas fa-sync"></i>
                                </button>
                            </div>
                        </div>
                        <div class="card-body">
                            <canvas id="${id}-chart" style="height: 300px;"></canvas>
                        </div>
                    </div>
                `;
                return container;
            },
            update: (data) => {
                const canvas = container.querySelector(`#${id}-chart`);
                if (!canvas) return;

                // Destroy existing chart
                if (widget.chart) {
                    widget.chart.destroy();
                }

                const ctx = canvas.getContext('2d');
                
                const chartConfig = {
                    type: config.chartType || 'line',
                    data: data,
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: config.chartType === 'doughnut' ? 'bottom' : 'top'
                            }
                        },
                        scales: config.chartType === 'doughnut' ? {} : {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    callback: function(value) {
                                        if (config.format === 'currency') {
                                            return new Intl.NumberFormat('pt-BR', {
                                                style: 'currency',
                                                currency: 'BRL',
                                                minimumFractionDigits: 0
                                            }).format(value);
                                        }
                                        return value;
                                    }
                                }
                            }
                        }
                    }
                };

                widget.chart = new Chart(ctx, chartConfig);
            }
        };

        widget.render();
        return widget;
    }

    createTableWidget(id, config) {
        const container = document.createElement('div');
        
        const widget = {
            id,
            type: 'table',
            config,
            element: container,
            render: () => {
                container.innerHTML = `
                    <div class="card h-100 table-widget" data-widget-id="${id}">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">${config.title}</h6>
                            <div class="table-actions">
                                <button class="btn btn-sm btn-outline-secondary" onclick="exportTable('${id}')">
                                    <i class="fas fa-download"></i>
                                </button>
                            </div>
                        </div>
                        <div class="card-body p-0">
                            <div class="table-responsive">
                                <table class="table table-hover mb-0" id="${id}-table">
                                    <thead class="table-light">
                                        <tr>
                                            ${config.columns.map(col => `
                                                <th class="${col.sortable ? 'sortable' : ''}" data-column="${col.key}">
                                                    ${col.label}
                                                    ${col.sortable ? '<i class="fas fa-sort text-muted"></i>' : ''}
                                                </th>
                                            `).join('')}
                                        </tr>
                                    </thead>
                                    <tbody id="${id}-tbody">
                                        <tr>
                                            <td colspan="${config.columns.length}" class="text-center py-4">
                                                <div class="spinner-border spinner-border-sm" role="status">
                                                    <span class="visually-hidden">Loading...</span>
                                                </div>
                                                <p class="mt-2 mb-0 text-muted">Carregando dados...</p>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                `;
                
                // Add sorting functionality
                if (config.columns.some(col => col.sortable)) {
                    this.addTableSorting(container, id);
                }
                
                return container;
            },
            update: (data) => {
                const tbody = container.querySelector(`#${id}-tbody`);
                if (!tbody || !data) return;

                if (data.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="${config.columns.length}" class="text-center py-4 text-muted">
                                <i class="fas fa-inbox fa-2x mb-2 d-block"></i>
                                Nenhum dado disponível
                            </td>
                        </tr>
                    `;
                    return;
                }

                tbody.innerHTML = data.map(row => `
                    <tr>
                        ${config.columns.map(col => {
                            let value = row[col.key];
                            
                            if (col.format === 'currency') {
                                value = new Intl.NumberFormat('pt-BR', {
                                    style: 'currency',
                                    currency: 'BRL',
                                    minimumFractionDigits: 0
                                }).format(value);
                            } else if (col.format === 'percentage') {
                                value = `${value}%`;
                            } else if (col.format === 'date') {
                                value = new Date(value).toLocaleDateString('pt-BR');
                            }
                            
                            return `<td>${value}</td>`;
                        }).join('')}
                    </tr>
                `).join('');
            }
        };

        widget.render();
        return widget;
    }

    createFilterWidget(id, config) {
        const container = document.createElement('div');
        
        const widget = {
            id,
            type: 'filters',
            config,
            element: container,
            render: () => {
                container.innerHTML = `
                    <div class="filter-widget mb-3" data-widget-id="${id}">
                        <div class="row g-3">
                            ${config.filters.map(filter => `
                                <div class="col-md-3">
                                    <label class="form-label small fw-semibold text-muted mb-1">
                                        ${filter.label}
                                    </label>
                                    <select class="form-select form-select-sm" 
                                            id="${id}-${filter.id}" 
                                            data-filter="${filter.id}">
                                        ${filter.options.map(opt => `
                                            <option value="${opt.value}" ${opt.selected ? 'selected' : ''}>
                                                ${opt.label}
                                            </option>
                                        `).join('')}
                                    </select>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;

                // Add change event listeners
                container.addEventListener('change', (e) => {
                    if (e.target.dataset.filter) {
                        const values = this.getFilterValues(id);
                        document.dispatchEvent(new CustomEvent('ubsFiltersChanged', {
                            detail: { widgetId: id, values }
                        }));
                    }
                });

                return container;
            },
            getFilterValues: () => {
                const values = {};
                const selects = container.querySelectorAll('select[data-filter]');
                selects.forEach(select => {
                    values[select.dataset.filter] = select.value;
                });
                return values;
            }
        };

        widget.render();
        return widget;
    }

    createConversationsPanelWidget(id, config) {
        const container = document.createElement('div');
        
        const widget = {
            id,
            type: 'conversations-panel',
            config,
            element: container,
            autoRefreshInterval: null,
            render: () => {
                container.innerHTML = `
                    <div class="card h-100 conversations-panel-widget" data-widget-id="${id}">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">
                                <i class="fab fa-whatsapp text-success me-2"></i>
                                ${config.title}
                                <span class="badge bg-danger ms-2" id="${id}-live-indicator">LIVE</span>
                            </h6>
                            <div class="conversations-actions">
                                <button class="btn btn-sm btn-outline-primary" onclick="refreshConversations('${id}')">
                                    <i class="fas fa-sync"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-secondary" onclick="toggleAutoRefresh('${id}')">
                                    <i class="fas fa-play" id="${id}-autorefresh-icon"></i>
                                </button>
                            </div>
                        </div>
                        <div class="card-body p-0">
                            <div class="conversations-container" style="height: 400px; overflow-y: auto;">
                                <div id="${id}-content" class="p-3">
                                    <div class="text-center py-4">
                                        <div class="spinner-border text-success" role="status">
                                            <span class="visually-hidden">Carregando conversas...</span>
                                        </div>
                                        <p class="mt-2 text-muted">Carregando conversas em tempo real...</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="card-footer bg-light">
                            <div class="row text-center">
                                <div class="col">
                                    <small class="text-muted">Conversas Ativas</small>
                                    <div class="fw-semibold" id="${id}-active-count">0</div>
                                </div>
                                <div class="col">
                                    <small class="text-muted">Última Atualização</small>
                                    <div class="fw-semibold" id="${id}-last-update">-</div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                // Setup auto-refresh if enabled
                if (config.autoRefresh) {
                    this.startAutoRefresh(widget);
                }

                // Load initial data
                setTimeout(() => {
                    this.refreshConversationsData(widget);
                }, 1000);

                return container;
            },
            update: (data) => {
                const contentElement = container.querySelector(`#${id}-content`);
                const activeCountElement = container.querySelector(`#${id}-active-count`);
                const lastUpdateElement = container.querySelector(`#${id}-last-update`);
                
                if (!contentElement) return;

                // Render conversations by tenant (for Super Admin) or directly (for Tenant)
                if (config.mode === 'system-wide' && data.tenants) {
                    this.renderSystemWideConversations(contentElement, data, id);
                } else if (data.conversations) {
                    this.renderTenantConversations(contentElement, data, id);
                } else {
                    this.renderEmptyState(contentElement);
                }

                // Update statistics
                const totalConversations = data.totalActiveConversations || 0;
                if (activeCountElement) activeCountElement.textContent = totalConversations;
                if (lastUpdateElement) lastUpdateElement.textContent = new Date().toLocaleTimeString('pt-BR');
            },
            startAutoRefresh: () => {
                if (widget.autoRefreshInterval) {
                    clearInterval(widget.autoRefreshInterval);
                }

                widget.autoRefreshInterval = setInterval(() => {
                    this.refreshConversationsData(widget);
                }, config.refreshInterval || 15000);

                const iconElement = container.querySelector(`#${id}-autorefresh-icon`);
                if (iconElement) {
                    iconElement.className = 'fas fa-pause';
                }
            },
            stopAutoRefresh: () => {
                if (widget.autoRefreshInterval) {
                    clearInterval(widget.autoRefreshInterval);
                    widget.autoRefreshInterval = null;
                }

                const iconElement = container.querySelector(`#${id}-autorefresh-icon`);
                if (iconElement) {
                    iconElement.className = 'fas fa-play';
                }
            }
        };

        widget.render();
        return widget;
    }

    renderSystemWideConversations(container, data, widgetId) {
        if (!data.tenants || data.tenants.length === 0) {
            this.renderEmptyState(container);
            return;
        }

        container.innerHTML = `
            <div class="system-conversations">
                ${data.tenants.map(tenant => `
                    <div class="tenant-section mb-3">
                        <div class="tenant-header d-flex justify-content-between align-items-center p-2 bg-light rounded">
                            <div>
                                <strong>${tenant.name}</strong>
                                <small class="text-muted ms-2">${tenant.domain}</small>
                            </div>
                            <span class="badge bg-primary">${tenant.activeConversations} ativas</span>
                        </div>
                        <div class="tenant-conversations mt-2">
                            ${this.renderConversationButtons(tenant.conversations || [], tenant.id)}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderTenantConversations(container, data, widgetId) {
        if (!data.conversations || data.conversations.length === 0) {
            this.renderEmptyState(container);
            return;
        }

        container.innerHTML = `
            <div class="tenant-conversations">
                <div class="conversations-grid">
                    ${this.renderConversationButtons(data.conversations, data.tenantId)}
                </div>
            </div>
        `;
    }

    renderConversationButtons(conversations, tenantId) {
        return `
            <div class="conversation-buttons d-flex flex-wrap gap-2">
                ${conversations.map(conv => {
                    const duration = conv.duration || 0;
                    const colorClass = duration <= 120 ? 'success' : duration <= 240 ? 'warning' : 'danger';
                    
                    return `
                        <button class="btn btn-sm btn-outline-${colorClass} conversation-btn" 
                                data-phone="${conv.phone}" 
                                data-tenant="${tenantId}"
                                onclick="showConversationDetails('${conv.phone}', '${tenantId}')">
                            <i class="fas fa-phone me-1"></i>
                            ${conv.phone}
                            <small class="ms-1">(${Math.floor(duration / 60)}m)</small>
                        </button>
                    `;
                }).join('')}
            </div>
        `;
    }

    renderEmptyState(container) {
        container.innerHTML = `
            <div class="text-center py-4 text-muted">
                <i class="fab fa-whatsapp fa-3x mb-3 opacity-50"></i>
                <h6>Nenhuma conversa ativa</h6>
                <p class="mb-0">As conversas ativas aparecerão aqui em tempo real</p>
            </div>
        `;
    }

    async refreshConversationsData(widget) {
        try {
            const endpoint = widget.config.mode === 'system-wide' 
                ? '/api/admin/conversations/real-time'
                : `/api/admin/conversations/real-time?tenantId=${widget.config.tenantId}`;

            const response = await fetch(endpoint, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('ubs_token')}` }
            });

            if (response.ok) {
                const data = await response.json();
                widget.update(data.data || data);
            } else {
                console.error('Conversations endpoint not available:', response.status);
                this.showWidgetError(widget, 'Unable to load conversations data');
            }
        } catch (error) {
            console.error('Error refreshing conversations:', error);
            this.showWidgetError(widget, 'Failed to refresh conversations');
        }
    }

    showWidgetError(widget, message) {
        if (widget.container) {
            widget.container.innerHTML = `
                <div class="widget-error text-center p-3">
                    <div class="error-icon mb-2">⚠️</div>
                    <div class="error-message small">${message}</div>
                </div>
            `;
        }
    }

    addTableSorting(container, id) {
        const sortableHeaders = container.querySelectorAll('th.sortable');
        
        sortableHeaders.forEach(header => {
            header.style.cursor = 'pointer';
            header.addEventListener('click', () => {
                const column = header.dataset.column;
                // Implement sorting logic here
                console.log(`Sorting by ${column}`);
            });
        });
    }

    getFilterValues(widgetId) {
        const widget = this.widgets.get(widgetId);
        if (widget && widget.getFilterValues) {
            return widget.getFilterValues();
        }
        return {};
    }

    updateWidget(id, data) {
        const widget = this.widgets.get(id);
        if (widget && widget.update) {
            widget.update(data);
        }
    }

    getWidget(id) {
        return this.widgets.get(id);
    }
}

// Global functions for widget interactions
window.refreshConversations = function(widgetId) {
    const widgetSystem = window.dashboardInstance?.widgetSystem;
    if (widgetSystem) {
        const widget = widgetSystem.getWidget(widgetId);
        if (widget) {
            widgetSystem.refreshConversationsData(widget);
        }
    }
};

window.toggleAutoRefresh = function(widgetId) {
    const widgetSystem = window.dashboardInstance?.widgetSystem;
    if (widgetSystem) {
        const widget = widgetSystem.getWidget(widgetId);
        if (widget) {
            if (widget.autoRefreshInterval) {
                widget.stopAutoRefresh();
            } else {
                widget.startAutoRefresh();
            }
        }
    }
};

window.showConversationDetails = function(phone, tenantId) {
    // Create and show modal with conversation details
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">
                        <i class="fab fa-whatsapp text-success me-2"></i>
                        Conversa: ${phone}
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="text-center py-4">
                        <div class="spinner-border" role="status">
                            <span class="visually-hidden">Carregando conversa...</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
    
    // Clean up modal when hidden
    modal.addEventListener('hidden.bs.modal', () => {
        document.body.removeChild(modal);
    });
    
    console.log(`Loading conversation details for ${phone} (tenant: ${tenantId})`);
};

// Export the class
window.DashboardWidgetSystem = DashboardWidgetSystem;

console.log('✅ Dashboard Widget Factory loaded successfully!');