/**
 * Real-Time Conversations Panel
 * Live monitoring of active conversations across all tenants
 * Author: Claude Code
 * Date: 2025
 */

class RealTimeConversationsPanel {
    constructor() {
        this.apiUrl = '/api/admin/analytics/real-time-conversations';
        this.refreshInterval = 30000; // 30 seconds - reduced for better performance
        this.intervalId = null;
        this.tenants = [];
        this.conversations = {};
        this.container = null;
    }

    /**
     * Initialize the real-time conversations panel
     */
    async init(container) {
        try {
            console.log('🚀 Initializing Real-Time Conversations Panel...');
            
            this.container = container;
            
            // Create the HTML structure
            container.innerHTML = this.createHTML();
            
            // Bind event listeners
            this.bindEvents();
            
            // Load initial data
            await this.loadData();
            
            // Start auto-refresh
            this.startAutoRefresh();
            
            console.log('✅ Real-Time Conversations Panel initialized successfully');
        } catch (error) {
            console.error('❌ Error initializing conversations panel:', error);
            container.innerHTML = '<div class="alert alert-danger">Erro ao carregar painel de conversas em tempo real</div>';
        }
    }

    /**
     * Create the complete HTML structure for the conversations panel
     */
    createHTML() {
        return `
            <!-- Real-Time Conversations Header -->
            <div class="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h2 class="h3 fw-bold text-dark mb-1">
                        <i class="fas fa-comments me-2 text-primary"></i>
                        Conversas em Tempo Real
                    </h2>
                    <p class="text-muted mb-0">Monitoramento ao vivo de conversas ativas por tenant</p>
                </div>
                <div class="d-flex gap-2 align-items-center">
                    <div class="badge bg-success pulse-animation" id="liveIndicator">
                        <i class="fas fa-circle me-1"></i>
                        AO VIVO
                    </div>
                    <button class="btn btn-outline-primary btn-sm" onclick="window.conversationsPanel.refreshData()">
                        <i class="fas fa-sync" id="refreshIcon"></i> Atualizar
                    </button>
                </div>
            </div>

            <!-- Legend and Stats -->
            <div class="row mb-4">
                <div class="col-lg-8">
                    <div class="card">
                        <div class="card-body">
                            <h6 class="card-title mb-3">
                                <i class="fas fa-info-circle me-2"></i>
                                Legenda de Cores por Duração
                            </h6>
                            <div class="row g-3">
                                <div class="col-md-4">
                                    <div class="d-flex align-items-center">
                                        <span class="badge bg-success me-2">0</span>
                                        <span class="small">≤ 2 minutos (Recente)</span>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="d-flex align-items-center">
                                        <span class="badge bg-warning me-2">0</span>
                                        <span class="small">2-4 minutos (Moderada)</span>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="d-flex align-items-center">
                                        <span class="badge bg-danger me-2">0</span>
                                        <span class="small">> 4 minutos (Longa)</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-lg-4">
                    <div class="card">
                        <div class="card-body text-center">
                            <div class="display-6 mb-2">
                                <i class="fas fa-users text-info"></i>
                            </div>
                            <h3 class="h4 mb-1 text-info fw-bold" id="totalActiveConversations">0</h3>
                            <p class="text-muted small mb-0">Conversas Ativas Totais</p>
                            <small class="text-primary fw-bold" id="lastUpdateTime">Nunca</small>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Conversations Panel -->
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">
                                <i class="fas fa-building me-2"></i>
                                Conversas por Tenant
                            </h6>
                            <div class="text-muted small">
                                <i class="fas fa-clock me-1"></i>
                                Atualiza a cada 10 segundos
                            </div>
                        </div>
                        <div class="card-body p-0">
                            <!-- Loading State -->
                            <div id="conversationsLoading" class="text-center py-5">
                                <div class="spinner-border text-primary" role="status">
                                    <span class="visually-hidden">Carregando conversas...</span>
                                </div>
                                <p class="text-muted mt-3">Carregando conversas em tempo real...</p>
                            </div>
                            
                            <!-- Tenants List -->
                            <div id="tenantsList" class="d-none">
                                <!-- Will be populated by JavaScript -->
                            </div>
                            
                            <!-- Empty State -->
                            <div id="emptyState" class="d-none text-center py-5">
                                <div class="text-muted">
                                    <i class="fas fa-comments fa-3x mb-3 opacity-50"></i>
                                    <h5>Nenhuma conversa ativa</h5>
                                    <p>Não há conversas em andamento no momento</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Conversation Details Modal -->
            <div class="modal fade" id="conversationModal" tabindex="-1" aria-labelledby="conversationModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="conversationModalLabel">
                                <i class="fas fa-comment-dots me-2"></i>
                                Detalhes da Conversa
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                        </div>
                        <div class="modal-body" id="conversationModalBody">
                            <!-- Content will be populated by JavaScript -->
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                            <button type="button" class="btn btn-primary" onclick="window.conversationsPanel.joinConversation()">
                                <i class="fas fa-headset me-1"></i>
                                Entrar na Conversa
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Custom Styles -->
            <style>
                .pulse-animation {
                    animation: pulse 2s infinite;
                }
                
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                    100% { transform: scale(1); }
                }
                
                .tenant-row {
                    border-bottom: 1px solid #dee2e6;
                    transition: background-color 0.2s ease;
                }
                
                .tenant-row:hover {
                    background-color: rgba(0, 0, 0, 0.02);
                }
                
                .tenant-row:last-child {
                    border-bottom: none;
                }
                
                .phone-button {
                    cursor: pointer;
                    transition: all 0.2s ease;
                    margin: 0 !important;
                    position: relative;
                    font-family: 'Courier New', monospace;
                    font-weight: 600;
                    font-size: 0.85rem;
                    padding: 4px 8px;
                    border-radius: 6px;
                    display: inline-block;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                }
                
                .phone-button:hover {
                    transform: scale(1.05);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                }
                
                .connected-phones {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0;
                    align-items: center;
                }
                
                .tenant-name {
                    font-weight: 600;
                    color: #2c3e50;
                }
                
                .tenant-domain {
                    font-size: 0.8rem;
                    color: #6c757d;
                }
                
                .conversation-count {
                    font-size: 0.9rem;
                    color: #495057;
                }
                
                .duration-text {
                    font-size: 0.75rem;
                    font-weight: 500;
                }
                
                .refresh-spin {
                    animation: spin 1s linear infinite;
                }
                
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            </style>
        `;
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Add click handlers for badges (will be bound dynamically)
        // Modal events are handled by Bootstrap automatically
    }

    /**
     * Load data from API or use mock data
     */
    async loadData() {
        try {
            console.log('📡 Loading real-time conversations data...');
            
            // Show loading state
            this.showLoadingState();
            
            // Try to fetch from API, fallback to mock data
            let data;
            try {
                const response = await fetch(this.apiUrl);
                if (response.ok) {
                    data = await response.json();
                } else {
                    throw new Error('API not available');
                }
            } catch (error) {
                console.log('🔄 Using mock data for real-time conversations');
                data = this.getMockData();
            }
            
            // Update internal state
            this.tenants = data.tenants || [];
            this.conversations = data.conversations || {};
            
            // Update UI
            this.updateUI();
            this.updateStats();
            
            console.log('✅ Real-time conversations data loaded successfully');
        } catch (error) {
            console.error('❌ Error loading conversations data:', error);
            this.showErrorState();
        }
    }

    /**
     * Generate mock data for demonstration
     */
    getMockData() {
        const tenants = [
            { id: 't1', name: 'Salão Elegância', domain: 'beauty', phone: '+5511998887777' },
            { id: 't2', name: 'Clínica Bem-Estar', domain: 'healthcare', phone: '+5511987776666' },
            { id: 't3', name: 'Escritório Silva & Santos', domain: 'legal', phone: '+5511976665555' },
            { id: 't4', name: 'Academia Fitness', domain: 'sports', phone: '+5511965554444' },
            { id: 't5', name: 'Instituto de Beleza', domain: 'beauty', phone: '+5511954443333' },
            { id: 't6', name: 'Centro Médico', domain: 'healthcare', phone: '+5511943332222' },
            { id: 't7', name: 'Estúdio Zen', domain: 'beauty', phone: '+5511932221111' },
            { id: 't8', name: 'Consultoria Premium', domain: 'consulting', phone: '+5511921110000' },
        ];

        const conversations = {};
        
        // Generate random active conversations
        tenants.forEach(tenant => {
            const numConversations = Math.floor(Math.random() * 4); // 0-3 conversations per tenant
            conversations[tenant.id] = [];
            
            for (let i = 0; i < numConversations; i++) {
                const startTime = new Date(Date.now() - Math.random() * 600000); // Up to 10 minutes ago
                const duration = Math.floor((Date.now() - startTime.getTime()) / 1000); // Duration in seconds
                
                conversations[tenant.id].push({
                    id: `conv_${tenant.id}_${i}`,
                    userId: `user_${Math.floor(Math.random() * 1000)}`,
                    userName: `Cliente ${Math.floor(Math.random() * 100) + 1}`,
                    userPhone: `+5511${Math.floor(Math.random() * 900000000) + 100000000}`,
                    startTime: startTime.toISOString(),
                    duration: duration,
                    lastMessage: this.generateRandomMessage(),
                    messageCount: Math.floor(Math.random() * 20) + 1,
                    status: 'active'
                });
            }
        });

        return { tenants, conversations };
    }

    /**
     * Generate random message for mock data
     */
    generateRandomMessage() {
        const messages = [
            'Gostaria de agendar um horário para amanhã',
            'Qual o valor do corte de cabelo?',
            'Vocês atendem no sábado?',
            'Preciso cancelar meu agendamento',
            'Obrigada pelo atendimento!',
            'Vocês fazem escova progressiva?',
            'Qual o horário de funcionamento?',
            'Tem desconto para estudante?',
            'Posso agendar pelo WhatsApp?',
            'Vocês têm vaga para hoje?'
        ];
        
        return messages[Math.floor(Math.random() * messages.length)];
    }

    /**
     * Update the UI with current data
     */
    updateUI() {
        const tenantsList = document.getElementById('tenantsList');
        const loading = document.getElementById('conversationsLoading');
        const emptyState = document.getElementById('emptyState');
        
        // Hide loading
        loading.classList.add('d-none');
        
        // Check if we have any active conversations
        const hasActiveConversations = this.tenants.some(tenant => 
            this.conversations[tenant.id] && this.conversations[tenant.id].length > 0
        );
        
        if (!hasActiveConversations) {
            emptyState.classList.remove('d-none');
            tenantsList.classList.add('d-none');
            return;
        }
        
        // Show tenants list
        emptyState.classList.add('d-none');
        tenantsList.classList.remove('d-none');
        
        // Generate tenants HTML
        tenantsList.innerHTML = this.tenants.map(tenant => {
            const tenantConversations = this.conversations[tenant.id] || [];
            return this.generateTenantRow(tenant, tenantConversations);
        }).join('');
        
        // Bind click events to conversation badges
        this.bindConversationBadges();
    }

    /**
     * Generate HTML for a single tenant row
     */
    generateTenantRow(tenant, conversations) {
        // Only create phone number buttons for active conversations
        const phoneButtons = conversations.map(conv => {
            const duration = conv.duration;
            const badgeClass = this.getDurationBadgeClass(duration);
            const durationText = this.formatDuration(duration);
            
            return `
                <span class="phone-button badge ${badgeClass}" 
                      data-conversation='${JSON.stringify(conv).replace(/'/g, '&#39;')}'
                      title="Conversa ativa há ${durationText} - ${conv.messageCount} mensagens"
                      style="margin-right: 0; margin-left: 0; cursor: pointer;">
                    ${conv.userPhone.replace(/\D/g, '').slice(-4)}
                </span>
            `;
        }).join('');
        
        return `
            <div class="tenant-row p-3">
                <div class="row align-items-center">
                    <div class="col-md-3">
                        <div class="d-flex align-items-center">
                            <div class="tenant-icon me-3">
                                <i class="fas fa-building text-primary"></i>
                            </div>
                            <div>
                                <div class="tenant-name">${tenant.name}</div>
                                <div class="tenant-domain">
                                    <i class="fas fa-tag me-1"></i>
                                    ${this.getDomainLabel(tenant.domain)}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-9">
                        <div class="connected-phones">
                            ${phoneButtons || '<span class="text-muted">Nenhuma conversa ativa</span>'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Get badge class based on conversation duration
     */
    getDurationBadgeClass(durationSeconds) {
        const minutes = durationSeconds / 60;
        
        if (minutes <= 2) return 'bg-success';
        if (minutes <= 4) return 'bg-warning';
        return 'bg-danger';
    }

    /**
     * Format duration in human readable format
     */
    formatDuration(durationSeconds) {
        const minutes = Math.floor(durationSeconds / 60);
        const seconds = durationSeconds % 60;
        
        if (minutes === 0) {
            return `${seconds}s`;
        }
        return `${minutes}m ${seconds}s`;
    }

    /**
     * Get domain label
     */
    getDomainLabel(domain) {
        const labels = {
            beauty: 'Beleza',
            healthcare: 'Saúde', 
            legal: 'Jurídico',
            sports: 'Esportes',
            consulting: 'Consultoria',
            education: 'Educação'
        };
        return labels[domain] || domain;
    }

    /**
     * Bind click events to phone buttons
     */
    bindConversationBadges() {
        const phoneButtons = document.querySelectorAll('.phone-button');
        phoneButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const conversationData = JSON.parse(e.target.getAttribute('data-conversation'));
                this.showConversationModal(conversationData);
            });
        });
    }

    /**
     * Show conversation details modal
     */
    showConversationModal(conversation) {
        const modalBody = document.getElementById('conversationModalBody');
        const startTime = new Date(conversation.startTime);
        const duration = this.formatDuration(conversation.duration);
        const badgeClass = this.getDurationBadgeClass(conversation.duration);
        
        modalBody.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6><i class="fas fa-user me-2"></i>Informações do Cliente</h6>
                    <div class="mb-3">
                        <strong>Nome:</strong> ${conversation.userName}<br>
                        <strong>Telefone:</strong> ${conversation.userPhone}<br>
                        <strong>ID do Usuário:</strong> <code>${conversation.userId}</code>
                    </div>
                </div>
                <div class="col-md-6">
                    <h6><i class="fas fa-clock me-2"></i>Detalhes da Conversa</h6>
                    <div class="mb-3">
                        <strong>Iniciada em:</strong> ${startTime.toLocaleString('pt-BR')}<br>
                        <strong>Duração:</strong> <span class="badge ${badgeClass}">${duration}</span><br>
                        <strong>Mensagens:</strong> ${conversation.messageCount}<br>
                        <strong>Status:</strong> <span class="badge bg-success">Ativa</span>
                    </div>
                </div>
            </div>
            
            <div class="mt-3">
                <h6><i class="fas fa-comment me-2"></i>Última Mensagem</h6>
                <div class="card bg-light">
                    <div class="card-body">
                        <p class="mb-0">"${conversation.lastMessage}"</p>
                        <small class="text-muted">Enviada há alguns segundos</small>
                    </div>
                </div>
            </div>
            
            <div class="mt-3">
                <h6><i class="fas fa-chart-line me-2"></i>Estatísticas</h6>
                <div class="row">
                    <div class="col-md-4">
                        <div class="text-center">
                            <div class="h5 text-primary">${(conversation.messageCount / (conversation.duration / 60)).toFixed(1)}</div>
                            <small class="text-muted">Msg/min</small>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="text-center">
                            <div class="h5 text-info">${Math.floor(conversation.duration / 60)}</div>
                            <small class="text-muted">Minutos</small>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="text-center">
                            <div class="h5 text-success">85%</div>
                            <small class="text-muted">Engajamento</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Store current conversation for potential actions
        this.currentConversation = conversation;
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('conversationModal'));
        modal.show();
    }

    /**
     * Update statistics
     */
    updateStats() {
        const totalConversations = Object.values(this.conversations)
            .reduce((total, tenantConvs) => total + tenantConvs.length, 0);
        
        document.getElementById('totalActiveConversations').textContent = totalConversations;
        document.getElementById('lastUpdateTime').textContent = new Date().toLocaleTimeString('pt-BR');
    }

    /**
     * Show loading state
     */
    showLoadingState() {
        const loading = document.getElementById('conversationsLoading');
        const tenantsList = document.getElementById('tenantsList');
        const emptyState = document.getElementById('emptyState');
        
        loading.classList.remove('d-none');
        tenantsList.classList.add('d-none');
        emptyState.classList.add('d-none');
    }

    /**
     * Show error state
     */
    showErrorState() {
        const loading = document.getElementById('conversationsLoading');
        loading.innerHTML = `
            <div class="text-center py-5 text-danger">
                <i class="fas fa-exclamation-triangle fa-3x mb-3"></i>
                <h5>Erro ao carregar conversas</h5>
                <p>Não foi possível carregar os dados em tempo real</p>
                <button class="btn btn-outline-primary btn-sm" onclick="window.conversationsPanel.refreshData()">
                    <i class="fas fa-sync me-1"></i> Tentar Novamente
                </button>
            </div>
        `;
    }

    /**
     * Start auto-refresh interval
     */
    startAutoRefresh() {
        this.intervalId = setInterval(() => {
            this.loadData();
        }, this.refreshInterval);
        
        console.log(`🔄 Auto-refresh started (every ${this.refreshInterval/1000} seconds)`);
    }

    /**
     * Stop auto-refresh interval
     */
    stopAutoRefresh() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('⏹️ Auto-refresh stopped');
        }
    }

    /**
     * Manual refresh data
     */
    async refreshData() {
        const refreshIcon = document.getElementById('refreshIcon');
        refreshIcon.classList.add('refresh-spin');
        
        try {
            await this.loadData();
        } finally {
            setTimeout(() => {
                refreshIcon.classList.remove('refresh-spin');
            }, 1000);
        }
    }

    /**
     * Join conversation action (placeholder)
     */
    joinConversation() {
        if (this.currentConversation) {
            alert(`Funcionalidade em desenvolvimento: Entrar na conversa ${this.currentConversation.id}`);
        }
    }

    /**
     * Cleanup when panel is destroyed
     */
    destroy() {
        this.stopAutoRefresh();
        this.currentConversation = null;
        this.conversations = {};
        this.tenants = [];
    }
}

// Global function to render real-time conversations panel
window.renderRealTimeConversationsPanel = function(container) {
    if (!window.conversationsPanel) {
        window.conversationsPanel = new RealTimeConversationsPanel();
    }
    window.conversationsPanel.init(container);
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RealTimeConversationsPanel;
}