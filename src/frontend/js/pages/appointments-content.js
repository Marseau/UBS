/**
 * Appointments - Conteúdo da Página
 * Extraído de appointments-standardized.html
 */

const AppointmentsContent = {
    // Renderizar o conteúdo completo dos agendamentos
    render() {
        return `
            <!-- Action Buttons -->
            <div class="action-buttons" id="actionButtons">
                <div class="d-flex align-items-center gap-2">
                    <button class="btn btn-primary btn-action" onclick="refreshAppointments()" aria-label="Atualizar agendamentos">
                        <i class="fas fa-sync me-2"></i>Atualizar
                    </button>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <button class="btn btn-outline-primary btn-action" onclick="exportAppointments()" aria-label="Exportar agendamentos">
                        <i class="fas fa-download me-2"></i>Exportar
                    </button>
                    <button class="btn btn-outline-secondary btn-action" onclick="toggleCalendarView()" aria-label="Alternar visualização">
                        <i class="fas fa-calendar me-2"></i>Calendário
                    </button>
                    <div class="text-muted compact-small">
                        <i class="fas fa-clock me-1"></i>
                        <span id="lastUpdate">Carregando...</span>
                    </div>
                </div>
            </div>
            
            <!-- KPIs dos Agendamentos -->
            <div class="ubs-content-section">
                <h3><i class="fas fa-calendar-check me-2"></i>Estatísticas de Agendamentos</h3>
                
                <!-- Stats Row -->
                <div class="row g-4 mb-4">
                    <!-- Agendamentos Hoje -->
                    <div class="col-lg-3 col-md-6">
                        <div class="metric-card">
                            <div class="metric-card-body">
                                <div class="metric-icon metric-icon-primary">
                                    <i class="fas fa-calendar-day"></i>
                                </div>
                                <div class="metric-content">
                                    <div class="metric-value" id="todayAppointments">12</div>
                                    <div class="metric-title">Agendamentos Hoje</div>
                                    <div class="metric-subtitle">Agendados para hoje</div>
                                    <div class="metric-trend trend-positive">
                                        <i class="fas fa-arrow-up"></i>
                                        <small>+3 vs ontem</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Confirmados -->
                    <div class="col-lg-3 col-md-6">
                        <div class="metric-card">
                            <div class="metric-card-body">
                                <div class="metric-icon metric-icon-success">
                                    <i class="fas fa-check-circle"></i>
                                </div>
                                <div class="metric-content">
                                    <div class="metric-value" id="confirmedAppointments">89</div>
                                    <div class="metric-title">Confirmados</div>
                                    <div class="metric-subtitle">Última semana</div>
                                    <div class="metric-trend trend-positive">
                                        <i class="fas fa-arrow-up"></i>
                                        <small>+15% vs anterior</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Pendentes -->
                    <div class="col-lg-3 col-md-6">
                        <div class="metric-card">
                            <div class="metric-card-body">
                                <div class="metric-icon metric-icon-warning">
                                    <i class="fas fa-clock"></i>
                                </div>
                                <div class="metric-content">
                                    <div class="metric-value" id="pendingAppointments">7</div>
                                    <div class="metric-title">Pendentes</div>
                                    <div class="metric-subtitle">Aguardando confirmação</div>
                                    <div class="metric-trend trend-stable">
                                        <i class="fas fa-minus"></i>
                                        <small>Estável</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Taxa de Comparecimento -->
                    <div class="col-lg-3 col-md-6">
                        <div class="metric-card">
                            <div class="metric-card-body">
                                <div class="metric-icon metric-icon-info">
                                    <i class="fas fa-percentage"></i>
                                </div>
                                <div class="metric-content">
                                    <div class="metric-value" id="attendanceRate">94%</div>
                                    <div class="metric-title">Taxa Comparecimento</div>
                                    <div class="metric-subtitle">Últimos 30 dias</div>
                                    <div class="metric-trend trend-positive">
                                        <i class="fas fa-arrow-up"></i>
                                        <small>+2% vs anterior</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Lista de Agendamentos -->
            <div class="ubs-content-section">
                <div class="table-widget">
                    <div class="table-header">
                        <div>
                            <div class="table-title">
                                <i class="fas fa-list me-2"></i>Lista de Agendamentos
                            </div>
                            <div class="table-subtitle">
                                <small class="text-muted">Lista de todos os agendamentos</small>
                            </div>
                        </div>
                        <div class="table-actions">
                            <button class="btn btn-success btn-sm" onclick="createNewAppointment()">
                                <i class="fas fa-plus me-1"></i>Novo
                            </button>
                            <button class="btn btn-outline-primary btn-sm" onclick="filterAppointments()">
                                <i class="fas fa-filter me-1"></i>Filtrar
                            </button>
                        </div>
                    </div>
                    <div class="table-body">
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead class="table-light">
                                    <tr>
                                        <th>Cliente</th>
                                        <th>Serviço</th>
                                        <th>Data/Hora</th>
                                        <th>Status</th>
                                        <th>Profissional</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody id="appointmentsTableBody">
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <div class="user-avatar me-2">M</div>
                                                <div>
                                                    <div class="fw-medium">Maria Silva</div>
                                                    <small class="text-muted">(11) 99999-9999</small>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div>
                                                <div class="fw-medium">Corte + Escova</div>
                                                <small class="text-muted">R$ 85,00</small>
                                            </div>
                                        </td>
                                        <td>
                                            <div>
                                                <div class="fw-medium">Hoje, 14:30</div>
                                                <small class="text-muted">26/07/2025</small>
                                            </div>
                                        </td>
                                        <td>
                                            <span class="badge bg-success">Confirmado</span>
                                        </td>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <div class="user-avatar user-avatar-sm me-2">A</div>
                                                <span>Ana Costa</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div class="btn-group btn-group-sm">
                                                <button class="btn btn-outline-primary" onclick="viewAppointment(1)">
                                                    <i class="fas fa-eye"></i>
                                                </button>
                                                <button class="btn btn-outline-secondary" onclick="editAppointment(1)">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button class="btn btn-outline-danger" onclick="cancelAppointment(1)">
                                                    <i class="fas fa-times"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <div class="user-avatar me-2">J</div>
                                                <div>
                                                    <div class="fw-medium">João Santos</div>
                                                    <small class="text-muted">(11) 88888-8888</small>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div>
                                                <div class="fw-medium">Barba + Bigode</div>
                                                <small class="text-muted">R$ 45,00</small>
                                            </div>
                                        </td>
                                        <td>
                                            <div>
                                                <div class="fw-medium">Amanhã, 09:00</div>
                                                <small class="text-muted">27/07/2025</small>
                                            </div>
                                        </td>
                                        <td>
                                            <span class="badge bg-warning">Pendente</span>
                                        </td>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <div class="user-avatar user-avatar-sm me-2">B</div>
                                                <span>Bruno Lima</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div class="btn-group btn-group-sm">
                                                <button class="btn btn-outline-primary" onclick="viewAppointment(2)">
                                                    <i class="fas fa-eye"></i>
                                                </button>
                                                <button class="btn btn-outline-secondary" onclick="editAppointment(2)">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button class="btn btn-outline-danger" onclick="cancelAppointment(2)">
                                                    <i class="fas fa-times"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // Inicializar funcionalidades específicas dos agendamentos
    init() {
        console.log('🚀 Inicializando Gerenciamento de Agendamentos...');
        
        // Carregar dados dos KPIs
        this.loadKPIs();
        
        // Carregar agendamentos
        this.loadAppointments();
        
        // Atualizar timestamp
        this.updateLastUpdate();
        
        console.log('✅ Agendamentos carregados com sucesso!');
    },

    // Carregar KPIs
    loadKPIs() {
        const kpis = {
            todayAppointments: '12',
            confirmedAppointments: '89',
            pendingAppointments: '7',
            attendanceRate: '94%'
        };

        Object.keys(kpis).forEach(kpi => {
            const element = document.getElementById(kpi);
            if (element) {
                element.textContent = kpis[kpi];
            }
        });
    },

    // Carregar lista de agendamentos
    loadAppointments() {
        // Dados já estão no HTML estático por enquanto
        console.log('📅 Agendamentos carregados da tabela estática');
    },

    // Atualizar timestamp
    updateLastUpdate() {
        const element = document.getElementById('lastUpdate');
        if (element) {
            const now = new Date();
            element.textContent = `Atualizado às ${now.toLocaleTimeString()}`;
        }
    }
};

// Funções de ação específicas dos agendamentos
function refreshAppointments() {
    console.log('🔄 Atualizando agendamentos...');
    AppointmentsContent.loadKPIs();
    AppointmentsContent.updateLastUpdate();
    showToast('Agendamentos atualizados!', 'success');
}

function exportAppointments() {
    console.log('📤 Exportando agendamentos...');
    showToast('Exportação iniciada!', 'info');
}

function toggleCalendarView() {
    console.log('📅 Alternando para visualização de calendário...');
    showToast('Visualização de calendário em desenvolvimento!', 'info');
}

function createNewAppointment() {
    console.log('➕ Criando novo agendamento...');
    showToast('Modal de novo agendamento em desenvolvimento!', 'info');
}

function filterAppointments() {
    console.log('🔍 Filtrando agendamentos...');
    showToast('Filtros em desenvolvimento!', 'info');
}

function viewAppointment(id) {
    console.log('👁️ Visualizando agendamento:', id);
    showToast(`Visualizando agendamento ${id}`, 'info');
}

function editAppointment(id) {
    console.log('✏️ Editando agendamento:', id);
    showToast(`Editando agendamento ${id}`, 'info');
}

function cancelAppointment(id) {
    if (confirm('Tem certeza que deseja cancelar este agendamento?')) {
        console.log('❌ Cancelando agendamento:', id);
        showToast(`Agendamento ${id} cancelado!`, 'warning');
    }
}

// Toast notification system
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer') || createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type === 'success' ? 'success' : type === 'warning' ? 'warning' : type === 'error' ? 'danger' : 'primary'} border-0`;
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
    
    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
    });
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container position-fixed top-0 end-0 p-3';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
    return container;
}

// Exportar para uso global
window.AppointmentsContent = AppointmentsContent;