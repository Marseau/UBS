/**
 * Widget de Uso de Conversas - Modelo de Cobrança UBS
 * Exibe uso mensal, limite do plano e alertas de upgrade
 */

class ConversationUsageWidget {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.currentUsage = 0;
        this.planLimit = 200;
        this.planName = 'básico';
        this.overagePrice = null;
        
        this.init();
    }

    init() {
        this.render();
        this.loadUsageData();
        
        // Auto-refresh a cada 30 segundos
        setInterval(() => {
            this.loadUsageData();
        }, 30000);
    }

    render() {
        this.container.innerHTML = `
            <div class="conversation-usage-widget">
                <div class="widget-header">
                    <h5 class="mb-0">
                        <i class="fas fa-comments me-2"></i>
                        Uso de Conversas - ${new Date().toLocaleDateString('pt-BR', {month: 'long', year: 'numeric'})}
                    </h5>
                    <span class="badge bg-primary" id="currentPlan">${this.planName}</span>
                </div>
                
                <div class="usage-progress mt-3">
                    <div class="d-flex justify-content-between mb-2">
                        <span class="usage-label">Conversas utilizadas</span>
                        <span class="usage-numbers">
                            <strong id="currentUsage">${this.currentUsage}</strong> / 
                            <span id="planLimit">${this.planLimit}</span>
                        </span>
                    </div>
                    
                    <div class="progress mb-2" style="height: 8px;">
                        <div class="progress-bar" 
                             id="usageProgressBar"
                             role="progressbar" 
                             style="width: ${this.getUsagePercentage()}%"
                             aria-valuenow="${this.currentUsage}" 
                             aria-valuemin="0" 
                             aria-valuemax="${this.planLimit}">
                        </div>
                    </div>
                    
                    <div class="usage-details">
                        <small class="text-muted" id="usageStatus">
                            ${this.getUsageStatusText()}
                        </small>
                    </div>
                </div>
                
                <div class="usage-alerts mt-3" id="usageAlerts">
                    ${this.getUsageAlerts()}
                </div>
                
                <div class="widget-footer mt-3">
                    <div class="row g-2">
                        <div class="col-6">
                            <button class="btn btn-outline-info btn-sm w-100" onclick="conversationUsageWidget.showDetails()">
                                <i class="fas fa-chart-line me-1"></i>Detalhes
                            </button>
                        </div>
                        <div class="col-6">
                            <button class="btn btn-outline-primary btn-sm w-100" onclick="conversationUsageWidget.refresh()">
                                <i class="fas fa-sync-alt me-1"></i>Atualizar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.updateProgressBar();
    }

    async loadUsageData() {
        try {
            // Buscar dados de uso da API
            const response = await fetch('/api/conversation-usage/current');
            
            if (response.ok) {
                const data = await response.json();
                this.updateUsageData(data);
            } else {
                // Mock data para desenvolvimento
                this.updateUsageData({
                    currentUsage: Math.floor(Math.random() * 250),
                    planLimit: 200,
                    planName: 'básico',
                    overagePrice: null,
                    billingPeriodStart: new Date().toISOString(),
                    billingPeriodEnd: new Date().toISOString()
                });
            }
        } catch (error) {
            console.warn('Erro ao carregar dados de uso, usando mock data:', error);
            
            // Mock data para desenvolvimento
            this.updateUsageData({
                currentUsage: Math.floor(Math.random() * 250),
                planLimit: 200, 
                planName: 'básico',
                overagePrice: null
            });
        }
    }

    updateUsageData(data) {
        this.currentUsage = data.currentUsage || 0;
        this.planLimit = data.planLimit || 200;
        this.planName = data.planName || 'básico';
        this.overagePrice = data.overagePrice;
        
        // Atualizar elementos do DOM
        document.getElementById('currentUsage').textContent = this.currentUsage;
        document.getElementById('planLimit').textContent = this.planLimit;
        document.getElementById('currentPlan').textContent = this.planName.charAt(0).toUpperCase() + this.planName.slice(1);
        document.getElementById('usageStatus').textContent = this.getUsageStatusText();
        document.getElementById('usageAlerts').innerHTML = this.getUsageAlerts();
        
        this.updateProgressBar();
    }

    updateProgressBar() {
        const progressBar = document.getElementById('usageProgressBar');
        const percentage = this.getUsagePercentage();
        
        progressBar.style.width = `${Math.min(percentage, 100)}%`;
        
        // Cores baseadas no uso
        progressBar.className = 'progress-bar';
        if (percentage >= 100) {
            progressBar.classList.add('bg-danger');
        } else if (percentage >= 90) {
            progressBar.classList.add('bg-warning');
        } else if (percentage >= 75) {
            progressBar.classList.add('bg-info');
        } else {
            progressBar.classList.add('bg-success');
        }
    }

    getUsagePercentage() {
        return this.planLimit > 0 ? Math.round((this.currentUsage / this.planLimit) * 100) : 0;
    }

    getUsageStatusText() {
        const percentage = this.getUsagePercentage();
        const remaining = Math.max(0, this.planLimit - this.currentUsage);
        
        if (percentage >= 100) {
            const overage = this.currentUsage - this.planLimit;
            if (this.planName === 'enterprise') {
                return `Limite excedido em ${overage} conversas. Cobrança: R$ ${(overage * 0.25).toFixed(2)}`;
            } else {
                return `Limite excedido em ${overage} conversas. Upgrade automático ativado!`;
            }
        } else if (percentage >= 90) {
            return `Atenção! Apenas ${remaining} conversas restantes este mês.`;
        } else if (percentage >= 75) {
            return `${remaining} conversas restantes. ${percentage}% utilizado.`;
        } else {
            return `${remaining} conversas disponíveis. Você está no ${percentage}% do limite.`;
        }
    }

    getUsageAlerts() {
        const percentage = this.getUsagePercentage();
        
        if (percentage >= 100) {
            if (this.planName === 'enterprise') {
                return `
                    <div class="alert alert-danger alert-sm">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        <strong>Limite excedido!</strong> 
                        Conversas extras serão cobradas R$ 0,25 cada.
                    </div>
                `;
            } else {
                const nextPlan = this.planName === 'básico' ? 'profissional' : 'enterprise';
                return `
                    <div class="alert alert-warning alert-sm">
                        <i class="fas fa-arrow-up me-2"></i>
                        <strong>Upgrade automático ativado!</strong> 
                        Seu plano será atualizado para ${nextPlan}.
                    </div>
                `;
            }
        } else if (percentage >= 90) {
            return `
                <div class="alert alert-warning alert-sm">
                    <i class="fas fa-exclamation-circle me-2"></i>
                    <strong>Quase no limite!</strong> 
                    Considere upgrade para evitar interrupções.
                </div>
            `;
        } else if (percentage >= 75) {
            return `
                <div class="alert alert-info alert-sm">
                    <i class="fas fa-info-circle me-2"></i>
                    Você está utilizando ${percentage}% do seu plano.
                </div>
            `;
        }
        
        return '';
    }

    showDetails() {
        // Abrir modal com detalhes completos
        const modal = new bootstrap.Modal(document.getElementById('conversationDetailsModal') || this.createDetailsModal());
        modal.show();
    }

    createDetailsModal() {
        const modalHtml = `
            <div class="modal fade" id="conversationDetailsModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-chart-line me-2"></i>
                                Detalhes do Uso de Conversas
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row g-4">
                                <div class="col-md-6">
                                    <h6>Informações do Plano</h6>
                                    <ul class="list-unstyled">
                                        <li><strong>Plano atual:</strong> ${this.planName.charAt(0).toUpperCase() + this.planName.slice(1)}</li>
                                        <li><strong>Limite mensal:</strong> ${this.planLimit} conversas</li>
                                        <li><strong>Conversas utilizadas:</strong> ${this.currentUsage}</li>
                                        <li><strong>Percentual de uso:</strong> ${this.getUsagePercentage()}%</li>
                                    </ul>
                                </div>
                                <div class="col-md-6">
                                    <h6>Modelo de Cobrança</h6>
                                    <ul class="list-unstyled">
                                        <li><strong>Cobrança:</strong> Por conversa recebida</li>
                                        <li><strong>WhatsApp:</strong> Ilimitado</li>
                                        <li><strong>Mensagens enviadas:</strong> Ilimitadas</li>
                                        <li><strong>IA:</strong> 6 segmentos especializados</li>
                                    </ul>
                                </div>
                            </div>
                            
                            ${this.planName !== 'enterprise' ? `
                                <div class="alert alert-info">
                                    <h6><i class="fas fa-arrow-up me-2"></i>Upgrade Automático</h6>
                                    <p class="mb-0">
                                        Quando você exceder o limite, seu plano será automaticamente 
                                        atualizado para o próximo nível. Sem interrupção do serviço!
                                    </p>
                                </div>
                            ` : `
                                <div class="alert alert-warning">
                                    <h6><i class="fas fa-calculator me-2"></i>Cobrança de Excedentes</h6>
                                    <p class="mb-0">
                                        No plano Enterprise, conversas extras são cobradas R$ 0,25 cada.
                                        Você tem controle total sobre seus custos.
                                    </p>
                                </div>
                            `}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        return document.getElementById('conversationDetailsModal');
    }

    refresh() {
        const refreshBtn = document.querySelector('.widget-footer .btn-outline-primary');
        const originalText = refreshBtn.innerHTML;
        
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Atualizando...';
        refreshBtn.disabled = true;
        
        this.loadUsageData().finally(() => {
            setTimeout(() => {
                refreshBtn.innerHTML = originalText;
                refreshBtn.disabled = false;
            }, 1000);
        });
    }
}

// Inicializar widget automaticamente quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    const widgetContainer = document.getElementById('conversationUsageWidget');
    if (widgetContainer) {
        window.conversationUsageWidget = new ConversationUsageWidget('conversationUsageWidget');
    }
});

// CSS para o widget
const widgetStyles = `
<style>
.conversation-usage-widget {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
}

.conversation-usage-widget .widget-header {
    display: flex;
    justify-content: between;
    align-items: center;
    margin-bottom: 0;
}

.conversation-usage-widget .usage-progress {
    background: rgba(255,255,255,0.1);
    border-radius: 8px;
    padding: 15px;
}

.conversation-usage-widget .progress {
    background: rgba(255,255,255,0.2);
    border-radius: 4px;
}

.conversation-usage-widget .alert-sm {
    padding: 8px 12px;
    margin-bottom: 0;
    font-size: 0.875rem;
}

.conversation-usage-widget .btn {
    border-radius: 6px;
    font-size: 0.875rem;
}

.conversation-usage-widget .badge {
    font-size: 0.75rem;
}

.usage-numbers {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-weight: 600;
}
</style>
`;

// Adicionar estilos se não existirem
if (!document.getElementById('conversation-usage-widget-styles')) {
    const styleElement = document.createElement('div');
    styleElement.id = 'conversation-usage-widget-styles';
    styleElement.innerHTML = widgetStyles;
    document.head.appendChild(styleElement);
}