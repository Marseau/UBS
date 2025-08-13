/**
 * UBS Dashboard Widget System
 * Sistema completo de widgets reutilizáveis para padronização do dashboard
 * 
 * @version 1.0.0
 * @author UBS Team
 */

// ============================================================================
// CORE WIDGET SYSTEM
// ============================================================================

// Prevent duplicate class definition
if (typeof window.UBSWidget === 'undefined') {
    window.UBSWidget = class UBSWidget {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.getElementById(container) : container;
        this.options = {
            theme: 'default',
            responsive: true,
            ...options
        };
        this.id = this.generateId();
        this.isRendered = false;
    }

    generateId() {
        return 'ubs-widget-' + Math.random().toString(36).substr(2, 9);
    }

    render() {
        if (!this.container) {
            console.error('❌ Container não encontrado para widget:', this.id);
            return;
        }
        this.isRendered = true;
        return this;
    }

    destroy() {
        if (this.container && this.isRendered) {
            this.container.innerHTML = '';
            this.isRendered = false;
        }
    }

    update(data) {
        console.log('🔄 Atualizando widget:', this.id);
        // Override in subclasses
    }
    }; // End of UBSWidget class
} // End of conditional check

// ============================================================================
// METRIC CARD WIDGETS
// ============================================================================

class MetricCardWidget extends UBSWidget {
    constructor(container, options = {}) {
        super(container, {
            title: 'Métrica',
            value: 0,
            subtitle: '',
            icon: 'fas fa-chart-line',
            trend: null, // { value: 12.5, direction: 'up', label: 'vs mês anterior' }
            color: 'primary', // primary, success, warning, danger, info
            format: 'number', // number, currency, percentage
            size: 'normal', // compact, normal, large
            clickable: false,
            ...options
        });
    }

    render() {
        super.render();
        
        const sizeClass = this.options.size === 'compact' ? 'metric-card-compact' : 
                         this.options.size === 'large' ? 'metric-card-large' : '';
        
        const clickableClass = this.options.clickable ? 'metric-card-clickable' : '';
        
        this.container.innerHTML = `
            <div class="metric-card ${sizeClass} ${clickableClass}" data-widget-id="${this.id}">
                <div class="metric-card-body">
                    <div class="metric-icon metric-icon-${this.options.color}">
                        <i class="${this.options.icon}"></i>
                    </div>
                    <div class="metric-content">
                        <div class="metric-value" id="${this.id}-value">${this.formatValue(this.options.value)}</div>
                        <div class="metric-title">${this.options.title}</div>
                        ${this.options.subtitle ? `<div class="metric-subtitle">${this.options.subtitle}</div>` : ''}
                        ${this.renderTrend()}
                    </div>
                </div>
            </div>
        `;

        if (this.options.clickable && this.options.onClick) {
            this.container.querySelector('.metric-card').addEventListener('click', this.options.onClick);
        }

        return this;
    }

    renderTrend() {
        if (!this.options.trend) return '';
        
        const { value, direction, label } = this.options.trend;
        const trendClass = direction === 'up' ? 'trend-positive' : direction === 'down' ? 'trend-negative' : 'trend-neutral';
        const icon = direction === 'up' ? 'fas fa-arrow-up' : direction === 'down' ? 'fas fa-arrow-down' : 'fas fa-minus';
        
        return `
            <div class="metric-trend ${trendClass}">
                <i class="${icon}"></i>
                <span>${value >= 0 ? '+' : ''}${value}%</span>
                ${label ? `<small>${label}</small>` : ''}
            </div>
        `;
    }

    formatValue(value) {
        switch (this.options.format) {
            case 'currency':
                return `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
            case 'percentage':
                return `${Number(value).toFixed(1)}%`;
            case 'ranking':
                return `#${Number(value)}`;
            case 'custom':
                return value; // Return value as-is for custom formatting
            case 'number':
            default:
                return Number(value).toLocaleString('pt-BR');
        }
    }

    update(data) {
        super.update(data);
        const valueEl = document.getElementById(`${this.id}-value`);
        if (valueEl && data.value !== undefined) {
            valueEl.textContent = this.formatValue(data.value);
        }
        
        if (data.trend) {
            this.options.trend = data.trend;
            const trendContainer = this.container.querySelector('.metric-trend');
            if (trendContainer) {
                trendContainer.outerHTML = this.renderTrend();
            }
        }
    }
}

// ============================================================================
// CHART WIDGETS
// ============================================================================

class ChartWidget extends UBSWidget {
    constructor(container, options = {}) {
        super(container, {
            type: 'line', // line, bar, doughnut, pie
            title: '',
            height: 300,
            showLegend: true,
            showTooltip: true,
            responsive: true,
            colors: ['#2D5A9B', '#28a745', '#ffc107', '#dc3545', '#17a2b8', '#6f42c1'],
            ...options
        });
        this.chart = null;
    }

    render() {
        super.render();
        
        this.container.innerHTML = `
            <div class="chart-widget" data-widget-id="${this.id}">
                ${this.options.title ? `
                    <div class="chart-header">
                        <h6 class="chart-title">${this.options.title}</h6>
                        ${this.options.actions ? this.renderActions() : ''}
                    </div>
                ` : ''}
                <div class="chart-body">
                    <canvas id="${this.id}-canvas" height="${this.options.height}"></canvas>
                </div>
            </div>
        `;

        return this;
    }

    renderActions() {
        return `
            <div class="chart-actions">
                ${this.options.actions.map(action => `
                    <button class="btn btn-sm btn-outline-secondary" onclick="${action.handler}">
                        ${action.icon ? `<i class="${action.icon}"></i>` : ''} ${action.label}
                    </button>
                `).join('')}
            </div>
        `;
    }

    createChart(data, options = {}, plugins = []) {
        const canvas = document.getElementById(`${this.id}-canvas`);
        if (!canvas) return null;

        const ctx = canvas.getContext('2d');
        
        if (this.chart) {
            this.chart.destroy();
        }

        const chartOptions = {
            responsive: this.options.responsive,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: this.options.showLegend,
                    position: 'top'
                },
                tooltip: {
                    enabled: this.options.showTooltip
                }
            },
            ...options
        };

        this.chart = new Chart(ctx, {
            type: this.options.type,
            data: data,
            options: chartOptions,
            plugins: plugins
        });

        return this.chart;
    }

    update(data) {
        super.update(data);
        if (this.chart && data) {
            // For DoughnutChart, re-sort data and update center text
            if (this instanceof DoughnutChartWidget) {
                const sortedData = this.sortChartData(data);
                const total = sortedData.datasets[0].data.reduce((sum, value) => sum + value, 0);
                
                // Update center text with new total
                this.options.centerText.mainText = new Intl.NumberFormat('pt-BR').format(total);
                
                this.chart.data = sortedData;
            } else {
                this.chart.data = data;
            }
            this.chart.update();
        }
    }

    sortChartData(data) {
        if (!data || !data.labels || !data.datasets || !data.datasets[0]) {
            return data;
        }

        const labels = data.labels;
        const values = data.datasets[0].data;
        const colors = data.datasets[0].backgroundColor || this.options.colors;

        // Create array of objects for sorting
        const combined = labels.map((label, index) => ({
            label,
            value: values[index],
            color: colors[index]
        }));

        // Sort by value (descending)
        combined.sort((a, b) => b.value - a.value);

        // Return sorted data
        return {
            labels: combined.map(item => item.label),
            datasets: [{
                ...data.datasets[0],
                data: combined.map(item => item.value),
                backgroundColor: combined.map(item => item.color)
            }]
        };
    }

    destroy() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
        super.destroy();
    }
}

class LineChartWidget extends ChartWidget {
    constructor(container, options = {}) {
        super(container, { type: 'line', ...options });
    }

    createChart(data, options = {}) {
        const colors = getUBSColors();
        if (data.datasets) {
            const colorList = [colors.info, colors.danger, colors.warning, colors.primary, colors.accent];
            data.datasets.forEach((ds, idx) => {
                ds.borderColor = colorList[idx % colorList.length];
                ds.backgroundColor = colorList[idx % colorList.length] + '22'; // transparência
                ds.pointBackgroundColor = colorList[idx % colorList.length];
                ds.pointBorderColor = colorList[idx % colorList.length];
            });
        }
        const defaultOptions = {
            plugins: {
                legend: { labels: { color: colors.primary } }
            },
            scales: {
                x: { ticks: { color: colors.primary } },
                y: { ticks: { color: colors.primary } }
            },
            elements: {
                line: { tension: 0.4 },
                point: { radius: 4, hoverRadius: 6 }
            }
        };
        return super.createChart(data, { ...defaultOptions, ...options });
    }
}

class BarChartWidget extends ChartWidget {
    constructor(container, options = {}) {
        super(container, { type: 'bar', ...options });
    }

    createChart(data, options = {}) {
        const colors = getUBSColors();
        if (data.datasets) {
            const colorList = [colors.info, colors.danger, colors.warning, colors.primary, colors.accent];
            data.datasets.forEach((ds, idx) => {
                ds.backgroundColor = colorList[idx % colorList.length] + 'cc'; // mais opaco
                ds.borderColor = colorList[idx % colorList.length];
            });
        }
        const defaultOptions = {
            plugins: {
                legend: { labels: { color: colors.primary } }
            },
            scales: {
                x: { ticks: { color: colors.primary } },
                y: { ticks: { color: colors.primary } }
            },
            elements: {
                bar: { borderRadius: 4 }
            }
        };
        return super.createChart(data, { ...defaultOptions, ...options });
    }
}

class DoughnutChartWidget extends ChartWidget {
    constructor(container, options = {}) {
        super(container, { 
            type: 'doughnut',
            centerText: {
                enabled: false,
                mainText: '',
                subText: '',
                mainColor: '#2D5A9B',
                subColor: '#6C757D'
            },
            ...options 
        });
    }

    createChart(data, options = {}) {
        const colors = getUBSColors();
        if (data.datasets && data.datasets[0]) {
            data.datasets[0].backgroundColor = [
                colors.info, colors.danger, colors.warning, colors.gray, colors.accent
            ];
        }
        const sortedData = this.sortChartData(data);
        const total = sortedData.datasets[0].data.reduce((sum, value) => sum + value, 0);
        const defaultOptions = {
            cutout: '60%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        color: colors.primary
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const value = context.parsed;
                            const percentage = ((value / total) * 100).toFixed(1);
                            const formattedValue = new Intl.NumberFormat('pt-BR').format(value);
                            return `${context.label}: ${formattedValue} (${percentage}%)`;
                        }
                    }
                }
            }
        };
        this.options.centerText.enabled = true;
        this.options.centerText.mainText = new Intl.NumberFormat('pt-BR').format(total);
        this.options.centerText.subText = this.options.centerText.subText || 'Total';
        const centerTextPlugin = this.createCenterTextPlugin();
        const chartOptions = { ...defaultOptions, ...options };
        chartOptions.plugins = chartOptions.plugins || {};
        return super.createChart(sortedData, chartOptions, [centerTextPlugin]);
    }

    createCenterTextPlugin() {
        const centerText = this.options.centerText;
        
        return {
            id: 'centerText',
            afterDraw: (chart) => {
                if (!centerText.enabled) return;
                
                const ctx = chart.ctx;
                const centerX = chart.width / 2;
                const centerY = chart.height / 2;
                
                ctx.save();
                
                // Main text (value)
                ctx.font = centerText.mainFont || 'bold 18px Inter';
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                ctx.fillStyle = centerText.mainColor || '#2D5A9B';
                ctx.fillText(centerText.mainText, centerX, centerY - 8);
                
                // Sub text (label)
                ctx.font = centerText.subFont || '12px Inter';
                ctx.fillStyle = centerText.subColor || '#6C757D';
                ctx.fillText(centerText.subText || 'Total', centerX, centerY + 12);
                
                ctx.restore();
            }
        };
    }
}

// ============================================================================
// TABLE WIDGETS
// ============================================================================

class TableWidget extends UBSWidget {
    constructor(container, options = {}) {
        super(container, {
            title: '',
            columns: [],
            data: [],
            pagination: false,
            search: false,
            sort: true,
            actions: [],
            striped: true,
            hover: true,
            compact: false,
            ...options
        });
    }

    render() {
        super.render();
        
        const tableClass = [
            'table',
            this.options.striped ? 'table-striped' : '',
            this.options.hover ? 'table-hover' : '',
            this.options.compact ? 'table-sm' : ''
        ].filter(Boolean).join(' ');

        this.container.innerHTML = `
            <div class="table-widget" data-widget-id="${this.id}">
                ${this.options.title ? `
                    <div class="table-header">
                        <h6 class="table-title">${this.options.title}</h6>
                        ${this.options.search ? this.renderSearch() : ''}
                    </div>
                ` : ''}
                <div class="table-body">
                    <div class="table-responsive">
                        <table class="${tableClass}">
                            <thead class="table-light">
                                ${this.renderHeader()}
                            </thead>
                            <tbody id="${this.id}-tbody">
                                ${this.renderRows()}
                            </tbody>
                        </table>
                    </div>
                </div>
                ${this.options.pagination ? this.renderPagination() : ''}
            </div>
        `;

        return this;
    }

    renderSearch() {
        return `
            <div class="table-search">
                <input type="text" class="form-control form-control-sm" placeholder="Buscar..." 
                       onkeyup="this.closest('.table-widget').dispatchEvent(new CustomEvent('search', {detail: this.value}))">
            </div>
        `;
    }

    renderHeader() {
        return `
            <tr>
                ${this.options.columns.map(col => `
                    <th ${col.sortable !== false && this.options.sort ? `class="sortable" onclick="this.closest('.table-widget').dispatchEvent(new CustomEvent('sort', {detail: '${col.key}'}))"` : ''}>
                        ${col.label}
                        ${col.sortable !== false && this.options.sort ? '<i class="fas fa-sort ms-1"></i>' : ''}
                    </th>
                `).join('')}
                ${this.options.actions.length > 0 ? '<th>Ações</th>' : ''}
            </tr>
        `;
    }

    renderRows() {
        return this.options.data.map(row => `
            <tr>
                ${this.options.columns.map(col => `
                    <td>${this.formatCell(row[col.key], col)}</td>
                `).join('')}
                ${this.options.actions.length > 0 ? `
                    <td>
                        ${this.options.actions.map(action => `
                            <button class="btn btn-sm ${action.class || 'btn-outline-primary'}" 
                                    onclick="${action.handler}('${row.id || row[this.options.columns[0].key]}')">
                                ${action.icon ? `<i class="${action.icon}"></i>` : ''} ${action.label}
                            </button>
                        `).join(' ')}
                    </td>
                ` : ''}
            </tr>
        `).join('');
    }

    formatCell(value, column) {
        if (column.formatter) {
            switch (column.formatter) {
                case 'currency':
                    return `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                case 'percentage':
                    return `${Number(value).toFixed(1)}%`;
                case 'badge':
                    return `<span class="badge ${column.badgeClass || 'bg-primary'}">${value}</span>`;
                case 'statusBadge':
                    const badgeClass = this.getStatusBadgeClass(value);
                    return `<span class="badge ${badgeClass}">${value}</span>`;
                case 'date':
                    return new Date(value).toLocaleDateString('pt-BR');
                default:
                    return value;
            }
        }
        // Legacy support for column.format
        if (column.format) {
            switch (column.format) {
                case 'currency':
                    return `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                case 'percentage':
                    return `${Number(value).toFixed(1)}%`;
                case 'badge':
                    return `<span class="badge ${column.badgeClass || 'bg-primary'}">${value}</span>`;
                case 'date':
                    return new Date(value).toLocaleDateString('pt-BR');
                default:
                    return value;
            }
        }
        return value;
    }

    getStatusBadgeClass(status) {
        const statusClasses = {
            // Status em português
            'Alto Risco': 'bg-danger',
            'Risco Médio': 'bg-warning text-dark',
            'Baixo Risco': 'bg-success',
            'Em Risco': 'bg-warning text-dark',
            'Saudável': 'bg-success',
            
            // Status em inglês (legacy)
            'Active': 'bg-success',
            'At Risk': 'bg-warning text-dark',
            'High Risk': 'bg-danger',
            'Inactive': 'bg-secondary',
            'Suspended': 'bg-dark'
        };
        return statusClasses[status] || 'bg-secondary';
    }

    renderPagination() {
        return `
            <div class="table-pagination">
                <nav>
                    <ul class="pagination pagination-sm justify-content-center">
                        <li class="page-item"><a class="page-link" href="#">Anterior</a></li>
                        <li class="page-item active"><a class="page-link" href="#">1</a></li>
                        <li class="page-item"><a class="page-link" href="#">2</a></li>
                        <li class="page-item"><a class="page-link" href="#">3</a></li>
                        <li class="page-item"><a class="page-link" href="#">Próximo</a></li>
                    </ul>
                </nav>
            </div>
        `;
    }

    update(data) {
        super.update(data);
        this.options.data = data;
        const tbody = document.getElementById(`${this.id}-tbody`);
        if (tbody) {
            tbody.innerHTML = this.renderRows();
        }
    }
}

// ============================================================================
// SECTION WIDGETS
// ============================================================================

class SectionWidget extends UBSWidget {
    constructor(container, options = {}) {
        super(container, {
            title: '',
            subtitle: '',
            actions: [],
            collapsible: false,
            collapsed: false,
            ...options
        });
    }

    render() {
        super.render();
        
        this.container.innerHTML = `
            <div class="section-widget ${this.options.collapsed ? 'collapsed' : ''}" data-widget-id="${this.id}">
                ${this.renderHeader()}
                <div class="section-body" id="${this.id}-body">
                    <!-- Content will be added by subclasses -->
                </div>
            </div>
        `;

        return this;
    }

    renderHeader() {
        if (!this.options.title && !this.options.actions.length) return '';
        
        return `
            <div class="section-header">
                <div class="section-title-area">
                    ${this.options.title ? `<h5 class="section-title">${this.options.title}</h5>` : ''}
                    ${this.options.subtitle ? `<p class="section-subtitle">${this.options.subtitle}</p>` : ''}
                </div>
                <div class="section-actions">
                    ${this.options.collapsible ? `
                        <button class="btn btn-sm btn-outline-secondary" onclick="this.closest('.section-widget').classList.toggle('collapsed')">
                            <i class="fas fa-chevron-down"></i>
                        </button>
                    ` : ''}
                    ${this.options.actions.map(action => `
                        <button class="btn btn-sm ${action.class || 'btn-outline-primary'}" onclick="${action.handler}">
                            ${action.icon ? `<i class="${action.icon}"></i>` : ''} ${action.label}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    getBodyContainer() {
        return document.getElementById(`${this.id}-body`);
    }
}

// ============================================================================
// FILTER WIDGETS
// ============================================================================

class FilterWidget extends UBSWidget {
    constructor(container, options = {}) {
        super(container, {
            filters: [], // { type: 'select', name: 'period', label: 'Período', options: [...] }
            layout: 'horizontal', // horizontal, vertical
            onChange: null,
            ...options
        });
    }

    render() {
        super.render();
        
        const layoutClass = this.options.layout === 'vertical' ? 'filter-vertical' : 'filter-horizontal';
        
        this.container.innerHTML = `
            <div class="filter-widget ${layoutClass}" data-widget-id="${this.id}">
                <div class="filter-body">
                    ${this.options.filters.map(filter => this.renderFilter(filter)).join('')}
                </div>
            </div>
        `;

        // Bind change events
        if (this.options.onChange) {
            this.container.addEventListener('change', (e) => {
                const filterValues = this.getFilterValues();
                this.options.onChange(filterValues, e.target);
            });
        }

        return this;
    }

    renderFilter(filter) {
        const colClass = this.options.layout === 'vertical' ? 'col-12 mb-3' : 'col-md-3 mb-3';
        
        switch (filter.type) {
            case 'select':
                return `
                    <div class="${colClass}">
                        <label class="form-label small fw-semibold text-muted mb-1">${filter.label}</label>
                        <select class="form-select form-select-sm" name="${filter.name}">
                            ${filter.options.map(opt => `
                                <option value="${opt.value}" ${opt.selected ? 'selected' : ''}>
                                    ${opt.label}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                `;
            case 'date':
                return `
                    <div class="${colClass}">
                        <label class="form-label small fw-semibold text-muted mb-1">${filter.label}</label>
                        <input type="date" class="form-control form-control-sm" name="${filter.name}" value="${filter.value || ''}">
                    </div>
                `;
            case 'text':
                return `
                    <div class="${colClass}">
                        <label class="form-label small fw-semibold text-muted mb-1">${filter.label}</label>
                        <input type="text" class="form-control form-control-sm" name="${filter.name}" 
                               placeholder="${filter.placeholder || ''}" value="${filter.value || ''}">
                    </div>
                `;
            case 'period-selector':
                return `
                    <div class="${colClass}">
                        <label class="form-label small fw-semibold text-muted mb-1">${filter.label}</label>
                        <div class="btn-group w-100" role="group">
                            <input type="radio" class="btn-check" name="${filter.name}" id="${filter.name}_7d" value="7d" ${filter.value === '7d' ? 'checked' : ''}>
                            <label class="btn btn-outline-primary btn-sm" for="${filter.name}_7d">7 dias</label>
                            
                            <input type="radio" class="btn-check" name="${filter.name}" id="${filter.name}_30d" value="30d" ${filter.value === '30d' || !filter.value ? 'checked' : ''}>
                            <label class="btn btn-outline-primary btn-sm" for="${filter.name}_30d">30 dias</label>
                            
                            <input type="radio" class="btn-check" name="${filter.name}" id="${filter.name}_90d" value="90d" ${filter.value === '90d' ? 'checked' : ''}>
                            <label class="btn btn-outline-primary btn-sm" for="${filter.name}_90d">90 dias</label>
                        </div>
                    </div>
                `;
            default:
                return '';
        }
    }

    getFilterValues() {
        const values = {};
        const inputs = this.container.querySelectorAll('select, input');
        inputs.forEach(input => {
            values[input.name] = input.value;
        });
        return values;
    }

    setFilterValue(name, value) {
        const input = this.container.querySelector(`[name="${name}"]`);
        if (input) {
            input.value = value;
            if (this.options.onChange) {
                this.options.onChange(this.getFilterValues(), input);
            }
        }
    }
}

// ============================================================================
// DASHBOARD LAYOUT WIDGETS
// ============================================================================

class DashboardRowWidget extends UBSWidget {
    constructor(container, options = {}) {
        super(container, {
            columns: [], // Array of column configurations
            gap: 'normal', // small, normal, large
            ...options
        });
    }

    render() {
        super.render();
        
        const gapClass = this.options.gap === 'small' ? 'g-2' : 
                        this.options.gap === 'large' ? 'g-4' : 'g-3';
        
        this.container.innerHTML = `
            <div class="row ${gapClass} mb-4" data-widget-id="${this.id}">
                ${this.options.columns.map((col, index) => this.renderColumn(col, index)).join('')}
            </div>
        `;

        return this;
    }

    renderColumn(column, index) {
        const colClass = column.class || 'col-md-6 col-lg-4';
        return `
            <div class="${colClass}">
                <div id="${this.id}-col-${index}" class="h-100">
                    <!-- Column content will be added programmatically -->
                </div>
            </div>
        `;
    }

    getColumnContainer(index) {
        return document.getElementById(`${this.id}-col-${index}`);
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

class UBSWidgetUtils {
    static formatCurrency(value, currency = 'BRL') {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    }

    static formatNumber(value, decimals = 0) {
        return new Intl.NumberFormat('pt-BR', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(value);
    }

    static formatPercentage(value, decimals = 1) {
        return `${Number(value).toFixed(decimals)}%`;
    }

    static formatDate(date, format = 'short') {
        const options = {
            short: { day: '2-digit', month: '2-digit', year: 'numeric' },
            long: { day: '2-digit', month: 'long', year: 'numeric' },
            time: { hour: '2-digit', minute: '2-digit' }
        };

        return new Intl.DateTimeFormat('pt-BR', options[format] || options.short).format(new Date(date));
    }


    static showLoading(widget) {
        if (widget.container) {
            widget.container.classList.add('widget-loading');
        }
    }

    static hideLoading(widget) {
        if (widget.container) {
            widget.container.classList.remove('widget-loading');
        }
    }

    static showError(container, message) {
        container.innerHTML = `
            <div class="alert alert-danger" role="alert">
                <i class="fas fa-exclamation-triangle me-2"></i>
                ${message}
            </div>
        `;
    }

    static showEmpty(container, message = 'Nenhum dado disponível') {
        container.innerHTML = `
            <div class="text-center py-4 text-muted">
                <i class="fas fa-inbox fa-2x mb-2"></i>
                <p>${message}</p>
            </div>
        `;
    }
}

// ============================================================================
// EXPORT WIDGET SYSTEM
// ============================================================================

function getUBSColors() {
  const root = document.documentElement;
  return {
    primary: getComputedStyle(root).getPropertyValue('--ubs-primary') || '#2D5A9B',
    info: getComputedStyle(root).getPropertyValue('--ubs-info') || '#17A2B8',
    warning: getComputedStyle(root).getPropertyValue('--ubs-warning') || '#FFC107',
    danger: getComputedStyle(root).getPropertyValue('--ubs-danger') || '#DC3545',
    accent: getComputedStyle(root).getPropertyValue('--ubs-accent') || '#4A7BC8',
    gray: '#6c757d'
  };
}

window.UBSWidgets = {
    // Core
    Widget: UBSWidget,
    
    // Metrics
    MetricCard: MetricCardWidget,
    
    // Charts
    Chart: ChartWidget,
    LineChart: LineChartWidget,
    BarChart: BarChartWidget,
    DoughnutChart: DoughnutChartWidget,
    
    // Tables
    Table: TableWidget,
    
    // Sections
    Section: SectionWidget,
    
    // Filters
    Filter: FilterWidget,
    
    // Layout
    DashboardRow: DashboardRowWidget,
    
    // Utilities
    Utils: UBSWidgetUtils
};

console.log('✅ UBS Widget System carregado com sucesso!'); 