/**
 * Doughnut Chart Widget - Padrão UBS
 * Widget reutilizável para gráficos de pizza com total centralizado
 * Baseado no padrão do dashboard principal
 */

// Garantir que Chart.js está disponível
if (typeof Chart === 'undefined') {
    console.error('❌ Chart.js não está carregado. DoughnutChartWidget requer Chart.js');
}

// Definir no escopo global imediatamente
window.DoughnutChartWidget = window.DoughnutChartWidget || class DoughnutChartWidget {
    constructor(canvasId, options = {}) {
        this.canvasId = canvasId;
        this.chart = null;
        this.options = {
            // Configurações padrão baseadas no dashboard
            cutout: '60%',
            centerText: {
                enabled: true,
                mainText: '',
                subText: 'Total',
                mainColor: '#2D5A9B',
                subColor: '#6C757D',
                mainFont: 'bold 18px Inter',
                subFont: '12px Inter'
            },
            colors: [
                '#e91e63', '#2196f3', '#ff9800', 
                '#4caf50', '#9c27b0', '#607d8b',
                '#795548', '#ff5722', '#00bcd4', '#ffeb3b'
            ],
            legend: {
                position: 'bottom',
                usePointStyle: true,
                padding: 15,
                fontSize: 11
            },
            tooltip: {
                showPercentage: true,
                showValue: true,
                currency: false
            },
            ...options
        };
    }

    /**
     * Renderizar o gráfico com dados
     */
    render(data, centerTotal = null) {
        console.log(`🎨 [Widget] Renderizando doughnut chart no canvas: ${this.canvasId}`);
        console.log(`🎨 [Widget] Dados recebidos:`, data);
        
        const canvas = document.getElementById(this.canvasId);
        if (!canvas) {
            console.error(`❌ [Widget] Canvas com ID '${this.canvasId}' não encontrado`);
            return;
        }

        console.log(`✅ [Widget] Canvas encontrado:`, canvas);
        const ctx = canvas.getContext('2d');

        // Destruir gráfico anterior se existir
        if (this.chart) {
            this.chart.destroy();
        }

        // Calcular total se não fornecido
        const total = centerTotal || data.datasets[0].data.reduce((a, b) => a + b, 0);
        
        // Configurar texto do centro
        this.options.centerText.mainText = this.formatCenterText(total);

        // Criar gráfico
        this.chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.datasets[0].data,
                    backgroundColor: this.options.colors.slice(0, data.labels.length),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: this.options.cutout,
                plugins: {
                    legend: {
                        position: this.options.legend.position,
                        labels: {
                            usePointStyle: this.options.legend.usePointStyle,
                            padding: this.options.legend.padding,
                            font: { size: this.options.legend.fontSize }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => this.formatTooltip(context, total)
                        }
                    }
                }
            },
            plugins: this.options.centerText.enabled ? [this.createCenterTextPlugin(total)] : []
        });

        return this.chart;
    }

    /**
     * Plugin para texto centralizado
     */
    createCenterTextPlugin(total) {
        const centerText = this.options.centerText;
        
        return {
            id: 'centerText',
            afterDraw: (chart) => {
                const ctx = chart.ctx;
                const centerX = chart.width / 2;
                const centerY = chart.height / 2;
                
                ctx.save();
                
                // Texto principal (valor)
                ctx.font = centerText.mainFont;
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                ctx.fillStyle = centerText.mainColor;
                ctx.fillText(centerText.mainText, centerX, centerY - 8);
                
                // Texto secundário (label)
                ctx.font = centerText.subFont;
                ctx.fillStyle = centerText.subColor;
                ctx.fillText(centerText.subText, centerX, centerY + 12);
                
                ctx.restore();
            }
        };
    }

    /**
     * Formatar texto do centro baseado no tipo de dados
     */
    formatCenterText(total) {
        if (this.options.tooltip.currency) {
            return `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
        }
        return total.toLocaleString();
    }

    /**
     * Formatar tooltip
     */
    formatTooltip(context, total) {
        const value = context.parsed;
        const percentage = ((value / total) * 100).toFixed(1);
        
        let label = context.label + ': ';
        
        if (this.options.tooltip.showValue) {
            if (this.options.tooltip.currency) {
                label += `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
            } else {
                label += value.toLocaleString();
            }
        }
        
        if (this.options.tooltip.showPercentage) {
            label += ` (${percentage}%)`;
        }
        
        return label;
    }

    /**
     * Atualizar dados do gráfico
     */
    updateData(data, centerTotal = null) {
        if (!this.chart) {
            return this.render(data, centerTotal);
        }

        const total = centerTotal || data.datasets[0].data.reduce((a, b) => a + b, 0);
        
        // Atualizar dados
        this.chart.data.labels = data.labels;
        this.chart.data.datasets[0].data = data.datasets[0].data;
        this.chart.data.datasets[0].backgroundColor = this.options.colors.slice(0, data.labels.length);
        
        // Atualizar texto do centro
        this.options.centerText.mainText = this.formatCenterText(total);
        
        this.chart.update();
        return this.chart;
    }

    /**
     * Destruir gráfico
     */
    destroy() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }

    /**
     * Redimensionar gráfico
     */
    resize() {
        if (this.chart) {
            this.chart.resize();
        }
    }

    /**
     * Obter instância do Chart.js
     */
    getChart() {
        return this.chart;
    }

    /**
     * Sort chart data by value (descending)
     */
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
};

// Configurações pré-definidas para diferentes tipos de uso

/**
 * Widget para receita (moeda)
 */
class RevenueDoughnutWidget extends DoughnutChartWidget {
    constructor(canvasId, options = {}) {
        super(canvasId, {
            centerText: {
                enabled: true,
                subText: 'Total Receita'
            },
            tooltip: {
                currency: true,
                showPercentage: true,
                showValue: true
            },
            ...options
        });
    }
}

/**
 * Widget para contadores (números)
 */
class CountDoughnutWidget extends DoughnutChartWidget {
    constructor(canvasId, options = {}) {
        super(canvasId, {
            centerText: {
                enabled: true,
                subText: 'Total'
            },
            tooltip: {
                currency: false,
                showPercentage: true,
                showValue: true
            },
            ...options
        });
    }
}

/**
 * Widget para status/categorias
 */
class StatusDoughnutWidget extends DoughnutChartWidget {
    constructor(canvasId, options = {}) {
        super(canvasId, {
            centerText: {
                enabled: true,
                subText: 'Total'
            },
            tooltip: {
                currency: false,
                showPercentage: true,
                showValue: true
            },
            colors: [
                '#ffc107', // Confirmed (yellow)
                '#28a745', // Completed (green)
                '#17a2b8', // Pending (cyan)
                '#dc3545', // Cancelled (red)
                '#6c757d'  // No show (gray)
            ],
            ...options
        });
    }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    console.log('🔧 [Widget] Carregando DoughnutChartWidget no window...');
    window.DoughnutChartWidget = DoughnutChartWidget;
    window.RevenueDoughnutWidget = RevenueDoughnutWidget;
    window.CountDoughnutWidget = CountDoughnutWidget;
    window.StatusDoughnutWidget = StatusDoughnutWidget;
    console.log('✅ [Widget] Widgets disponíveis:', {
        DoughnutChartWidget: !!window.DoughnutChartWidget,
        RevenueDoughnutWidget: !!window.RevenueDoughnutWidget,
        CountDoughnutWidget: !!window.CountDoughnutWidget,
        StatusDoughnutWidget: !!window.StatusDoughnutWidget
    });
}

// Exportar para módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DoughnutChartWidget,
        RevenueDoughnutWidget,
        CountDoughnutWidget,
        StatusDoughnutWidget
    };
}