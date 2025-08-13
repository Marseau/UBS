/**
 * Widget de Informações sobre Atualização de Dados
 * 
 * Componente que substitui os botões de "refresh" e mostra informações
 * sobre quando os dados foram atualizados pela última vez (4:00 AM)
 */

class DataUpdateInfoWidget {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.lastUpdateTime = this.calculateLastUpdate();
        this.nextUpdateTime = this.calculateNextUpdate();
        
        this.init();
    }
    
    /**
     * Calcula quando foi a última atualização (4:00 AM)
     */
    calculateLastUpdate() {
        const now = new Date();
        const today4AM = new Date();
        today4AM.setHours(4, 0, 0, 0);
        
        // Se ainda não passou das 4:00 AM hoje, a última foi ontem
        if (now < today4AM) {
            today4AM.setDate(today4AM.getDate() - 1);
        }
        
        return today4AM;
    }
    
    /**
     * Calcula quando será a próxima atualização (4:00 AM)
     */
    calculateNextUpdate() {
        const now = new Date();
        const next4AM = new Date();
        next4AM.setHours(4, 0, 0, 0);
        
        // Se já passou das 4:00 AM hoje, a próxima é amanhã
        if (now >= next4AM) {
            next4AM.setDate(next4AM.getDate() + 1);
        }
        
        return next4AM;
    }
    
    /**
     * Formatar data para exibição
     */
    formatDateTime(date) {
        return date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    /**
     * Calcular tempo até próxima atualização
     */
    getTimeUntilNext() {
        const now = new Date();
        const diff = this.nextUpdateTime - now;
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }
    
    /**
     * Inicializar o widget
     */
    init() {
        if (!this.container) {
            console.warn(`Container ${this.containerId} não encontrado`);
            return;
        }
        
        this.render();
        this.startUpdateTimer();
    }
    
    /**
     * Renderizar o widget
     */
    render() {
        const timeUntilNext = this.getTimeUntilNext();
        
        this.container.innerHTML = `
            <div class="data-update-info-widget">
                <button type="button" class="btn btn-outline-info btn-sm" data-bs-toggle="modal" data-bs-target="#dataUpdateModal">
                    <i class="fas fa-info-circle me-2"></i>
                    Info Dados
                </button>
                
                <!-- Badge com próxima atualização -->
                <small class="text-muted ms-2 d-none d-md-inline">
                    <i class="fas fa-clock me-1"></i>
                    Próxima: ${timeUntilNext}
                </small>
            </div>
            
            <!-- Modal com informações detalhadas -->
            <div class="modal fade" id="dataUpdateModal" tabindex="-1" aria-labelledby="dataUpdateModalLabel" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white">
                            <h5 class="modal-title" id="dataUpdateModalLabel">
                                <i class="fas fa-database me-2"></i>
                                Informações sobre Atualização de Dados
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row g-3">
                                <div class="col-12">
                                    <div class="alert alert-info d-flex align-items-center">
                                        <i class="fas fa-info-circle fa-2x me-3"></i>
                                        <div>
                                            <strong>Sistema Otimizado</strong><br>
                                            Os dados são processados automaticamente durante a madrugada para garantir performance máxima durante o dia.
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="col-md-6">
                                    <div class="card border-success">
                                        <div class="card-body text-center">
                                            <i class="fas fa-check-circle fa-2x text-success mb-2"></i>
                                            <h6 class="card-title">Última Atualização</h6>
                                            <p class="card-text">
                                                <strong>${this.formatDateTime(this.lastUpdateTime)}</strong>
                                            </p>
                                            <small class="text-muted">Dados atuais no sistema</small>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="col-md-6">
                                    <div class="card border-primary">
                                        <div class="card-body text-center">
                                            <i class="fas fa-clock fa-2x text-primary mb-2"></i>
                                            <h6 class="card-title">Próxima Atualização</h6>
                                            <p class="card-text">
                                                <strong>${this.formatDateTime(this.nextUpdateTime)}</strong>
                                            </p>
                                            <small class="text-muted">Em ${timeUntilNext}</small>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="col-12">
                                    <h6><i class="fas fa-cogs me-2"></i>Como Funciona:</h6>
                                    <ul class="list-unstyled">
                                        <li class="mb-2">
                                            <i class="fas fa-moon text-primary me-2"></i>
                                            <strong>04:00 AM:</strong> Sistema processa todos os dados do dia anterior
                                        </li>
                                        <li class="mb-2">
                                            <i class="fas fa-chart-line text-success me-2"></i>
                                            <strong>Métricas:</strong> Agendamentos, receita, clientes e IA são calculados
                                        </li>
                                        <li class="mb-2">
                                            <i class="fas fa-tachometer-alt text-warning me-2"></i>
                                            <strong>Performance:</strong> Dashboards carregam instantaneamente durante o dia
                                        </li>
                                        <li class="mb-2">
                                            <i class="fas fa-shield-alt text-info me-2"></i>
                                            <strong>Confiabilidade:</strong> Dados consistentes e sempre disponíveis
                                        </li>
                                    </ul>
                                </div>
                                
                                <div class="col-12">
                                    <div class="alert alert-light">
                                        <h6><i class="fas fa-lightbulb me-2"></i>Dica:</h6>
                                        <p class="mb-0">
                                            Para ver dados mais recentes, aguarde a próxima atualização automática. 
                                            Este sistema garante que todos os usuários vejam informações consistentes 
                                            e o dashboard tenha performance otimizada.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-primary" onclick="this.checkCronStatus()">
                                <i class="fas fa-heartbeat me-2"></i>
                                Verificar Status
                            </button>
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Iniciar timer para atualizar o countdown
     */
    startUpdateTimer() {
        // Atualizar a cada minuto
        setInterval(() => {
            this.updateCountdown();
        }, 60000);
    }
    
    /**
     * Atualizar countdown na interface
     */
    updateCountdown() {
        const timeUntilNext = this.getTimeUntilNext();
        const countdownElement = this.container.querySelector('.text-muted');
        
        if (countdownElement) {
            countdownElement.innerHTML = `
                <i class="fas fa-clock me-1"></i>
                Próxima: ${timeUntilNext}
            `;
        }
        
        // Atualizar no modal se estiver aberto
        const modalCountdown = document.querySelector('#dataUpdateModal .text-muted');
        if (modalCountdown) {
            modalCountdown.textContent = `Em ${timeUntilNext}`;
        }
        
        // Se passou da hora da atualização, recalcular
        const now = new Date();
        if (now >= this.nextUpdateTime) {
            this.lastUpdateTime = this.calculateLastUpdate();
            this.nextUpdateTime = this.calculateNextUpdate();
            this.render();
        }
    }
    
    /**
     * Verificar status do cron job
     */
    async checkCronStatus() {
        try {
            const response = await fetch('/api/analytics/cron-status');
            const result = await response.json();
            
            if (result.success) {
                const lastUpdate = new Date(result.data.lastUpdate);
                const status = result.data.lastStatus;
                
                let statusColor = 'success';
                let statusIcon = 'check-circle';
                let statusText = 'Funcionando normalmente';
                
                if (status === 'error') {
                    statusColor = 'danger';
                    statusIcon = 'exclamation-triangle';
                    statusText = 'Erro na última execução';
                } else if (status === 'warning') {
                    statusColor = 'warning';
                    statusIcon = 'exclamation-circle';
                    statusText = 'Aviso na última execução';
                }
                
                // Mostrar alert com status
                const alertHtml = `
                    <div class="alert alert-${statusColor} alert-dismissible fade show" role="alert">
                        <i class="fas fa-${statusIcon} me-2"></i>
                        <strong>Status do Sistema:</strong> ${statusText}<br>
                        <small>Última execução: ${lastUpdate.toLocaleString('pt-BR')}</small>
                        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                    </div>
                `;
                
                const modalBody = document.querySelector('#dataUpdateModal .modal-body');
                modalBody.insertAdjacentHTML('afterbegin', alertHtml);
                
            } else {
                throw new Error(result.message || 'Erro ao verificar status');
            }
            
        } catch (error) {
            console.error('Erro ao verificar status do cron:', error);
            
            const alertHtml = `
                <div class="alert alert-warning alert-dismissible fade show" role="alert">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    <strong>Não foi possível verificar o status</strong><br>
                    <small>Erro: ${error.message}</small>
                    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                </div>
            `;
            
            const modalBody = document.querySelector('#dataUpdateModal .modal-body');
            modalBody.insertAdjacentHTML('afterbegin', alertHtml);
        }
    }
    
    /**
     * Destruir o widget
     */
    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

/**
 * Função global para criar widget de informações de dados
 */
window.createDataUpdateInfoWidget = function(containerId) {
    return new DataUpdateInfoWidget(containerId);
};

/**
 * Função global simplificada para mostrar informações
 */
window.showDataUpdateInfo = function() {
    const widget = new DataUpdateInfoWidget('temp-widget-container');
    
    // Criar container temporário se não existir
    if (!document.getElementById('temp-widget-container')) {
        const tempContainer = document.createElement('div');
        tempContainer.id = 'temp-widget-container';
        tempContainer.style.display = 'none';
        document.body.appendChild(tempContainer);
    }
    
    widget.render();
    
    // Abrir modal diretamente
    const modal = new bootstrap.Modal(document.getElementById('dataUpdateModal'));
    modal.show();
    
    // Limpar quando modal fechar
    document.getElementById('dataUpdateModal').addEventListener('hidden.bs.modal', () => {
        widget.destroy();
        const tempContainer = document.getElementById('temp-widget-container');
        if (tempContainer) {
            tempContainer.remove();
        }
    }, { once: true });
};

// Exportar para uso em módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataUpdateInfoWidget;
} 