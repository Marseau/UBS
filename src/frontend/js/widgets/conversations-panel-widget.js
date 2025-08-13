/**
 * UBS Conversations Panel Widget
 * Widget especializado para exibir conversas do WhatsApp
 * 
 * @version 1.0.0
 * @author UBS Team
 */

class ConversationsPanelWidget extends UBSWidget {
    constructor(container, options = {}) {
        super(container, {
            title: 'Conversas WhatsApp',
            height: 600,
            showSearch: true,
            showFilters: true,
            autoRefresh: true,
            refreshInterval: 30000, // 30 segundos
            maxConversations: 50,
            showStatus: true,
            showPreview: true,
            ...options
        });
        
        this.conversations = [];
        this.filteredConversations = [];
        this.refreshTimer = null;
        this.selectedConversation = null;
    }

    render() {
        super.render();
        
        this.container.innerHTML = `
            <div class="conversations-panel-widget" data-widget-id="${this.id}">
                <div class="conversations-header">
                    <div class="d-flex justify-content-between align-items-center">
                        <h6 class="conversations-title mb-0">
                            <i class="fab fa-whatsapp text-success me-2"></i>
                            ${this.options.title}
                        </h6>
                        <div class="conversations-actions">
                            <button class="btn btn-sm btn-outline-primary" onclick="refreshConversations('${this.id}')">
                                <i class="fas fa-sync-alt"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-secondary" onclick="toggleConversationsSettings('${this.id}')">
                                <i class="fas fa-cog"></i>
                            </button>
                        </div>
                    </div>
                </div>

                ${this.options.showFilters ? this.renderFilters() : ''}
                ${this.options.showSearch ? this.renderSearch() : ''}

                <div class="conversations-body" style="height: ${this.options.height - 120}px;">
                    <div class="conversations-list" id="${this.id}-list">
                        <div class="text-center py-4">
                            <div class="spinner-border text-success" role="status">
                                <span class="visually-hidden">Carregando conversas...</span>
                            </div>
                            <p class="mt-2 text-muted">Carregando conversas...</p>
                        </div>
                    </div>
                </div>

                ${this.options.showStatus ? this.renderStatus() : ''}
            </div>
        `;

        // Initialize auto-refresh
        if (this.options.autoRefresh) {
            this.startAutoRefresh();
        }

        return this;
    }

    renderFilters() {
        return `
            <div class="conversations-filters">
                <div class="row g-2 mb-3">
                    <div class="col-md-3">
                        <select class="form-select form-select-sm" id="${this.id}-status-filter" onchange="filterConversations('${this.id}')">
                            <option value="">Todos os Status</option>
                            <option value="active">Ativas</option>
                            <option value="pending">Pendentes</option>
                            <option value="resolved">Resolvidas</option>
                            <option value="archived">Arquivadas</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <select class="form-select form-select-sm" id="${this.id}-tenant-filter" onchange="filterConversations('${this.id}')">
                            <option value="">Todos os Tenants</option>
                            <option value="tenant1">Salão Bella Vista</option>
                            <option value="tenant2">Clínica Dr. Silva</option>
                            <option value="tenant3">Advocacia Santos</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <select class="form-select form-select-sm" id="${this.id}-priority-filter" onchange="filterConversations('${this.id}')">
                            <option value="">Todas as Prioridades</option>
                            <option value="high">Alta</option>
                            <option value="medium">Média</option>
                            <option value="low">Baixa</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <select class="form-select form-select-sm" id="${this.id}-time-filter" onchange="filterConversations('${this.id}')">
                            <option value="">Todos os Períodos</option>
                            <option value="today">Hoje</option>
                            <option value="week">Esta Semana</option>
                            <option value="month">Este Mês</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    }

    renderSearch() {
        return `
            <div class="conversations-search mb-3">
                <div class="input-group">
                    <span class="input-group-text">
                        <i class="fas fa-search"></i>
                    </span>
                    <input type="text" class="form-control" id="${this.id}-search" 
                           placeholder="Buscar por nome, telefone ou mensagem..." 
                           onkeyup="searchConversations('${this.id}', this.value)">
                </div>
            </div>
        `;
    }

    renderStatus() {
        return `
            <div class="conversations-status">
                <div class="row g-2 text-center">
                    <div class="col-3">
                        <div class="status-item">
                            <div class="status-value text-success" id="${this.id}-active-count">0</div>
                            <div class="status-label">Ativas</div>
                        </div>
                    </div>
                    <div class="col-3">
                        <div class="status-item">
                            <div class="status-value text-warning" id="${this.id}-pending-count">0</div>
                            <div class="status-label">Pendentes</div>
                        </div>
                    </div>
                    <div class="col-3">
                        <div class="status-item">
                            <div class="status-value text-info" id="${this.id}-resolved-count">0</div>
                            <div class="status-label">Resolvidas</div>
                        </div>
                    </div>
                    <div class="col-3">
                        <div class="status-item">
                            <div class="status-value text-muted" id="${this.id}-total-count">0</div>
                            <div class="status-label">Total</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderConversationsList() {
        const listContainer = document.getElementById(`${this.id}-list`);
        if (!listContainer) return;

        if (this.filteredConversations.length === 0) {
            listContainer.innerHTML = `
                <div class="text-center py-4">
                    <i class="fas fa-comments fa-3x text-muted mb-3"></i>
                    <p class="text-muted">Nenhuma conversa encontrada</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = this.filteredConversations.map(conversation => this.renderConversationItem(conversation)).join('');
    }

    renderConversationItem(conversation) {
        const statusClass = this.getStatusClass(conversation.status);
        const priorityClass = this.getPriorityClass(conversation.priority);
        const timeAgo = this.formatTimeAgo(conversation.lastMessage.timestamp);
        
        return `
            <div class="conversation-item ${conversation.unread ? 'unread' : ''}" 
                 data-conversation-id="${conversation.id}"
                 onclick="selectConversation('${this.id}', '${conversation.id}')">
                
                <div class="conversation-avatar">
                    <div class="avatar-circle ${statusClass}">
                        ${conversation.customer.avatar ? 
                            `<img src="${conversation.customer.avatar}" alt="${conversation.customer.name}">` :
                            `<i class="fas fa-user"></i>`
                        }
                    </div>
                    ${conversation.unread ? '<div class="unread-indicator"></div>' : ''}
                </div>

                <div class="conversation-content">
                    <div class="conversation-header">
                        <div class="customer-info">
                            <span class="customer-name">${conversation.customer.name}</span>
                            <span class="customer-phone">${conversation.customer.phone}</span>
                            <span class="tenant-badge">${conversation.tenant.name}</span>
                        </div>
                        <div class="conversation-meta">
                            <span class="priority-badge ${priorityClass}">${this.formatPriority(conversation.priority)}</span>
                            <span class="time-stamp">${timeAgo}</span>
                        </div>
                    </div>

                    <div class="conversation-preview">
                        <div class="last-message">
                            ${conversation.lastMessage.type === 'text' ? 
                                `<span class="message-text">${this.truncateText(conversation.lastMessage.content, 80)}</span>` :
                                `<span class="message-media"><i class="fas fa-${this.getMessageIcon(conversation.lastMessage.type)}"></i> ${conversation.lastMessage.type}</span>`
                            }
                        </div>
                        ${conversation.unreadCount > 0 ? 
                            `<div class="unread-count">${conversation.unreadCount}</div>` : ''
                        }
                    </div>

                    <div class="conversation-tags">
                        ${conversation.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                </div>

                <div class="conversation-actions">
                    <button class="btn btn-sm btn-outline-primary" onclick="openConversation('${conversation.id}')" title="Abrir conversa">
                        <i class="fas fa-external-link-alt"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="markAsRead('${conversation.id}')" title="Marcar como lida">
                        <i class="fas fa-check"></i>
                    </button>
                    <div class="dropdown">
                        <button class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <ul class="dropdown-menu">
                            <li><a class="dropdown-item" href="#" onclick="assignConversation('${conversation.id}')">
                                <i class="fas fa-user-tag me-2"></i>Atribuir
                            </a></li>
                            <li><a class="dropdown-item" href="#" onclick="archiveConversation('${conversation.id}')">
                                <i class="fas fa-archive me-2"></i>Arquivar
                            </a></li>
                            <li><a class="dropdown-item" href="#" onclick="prioritizeConversation('${conversation.id}')">
                                <i class="fas fa-flag me-2"></i>Priorizar
                            </a></li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }

    // Utility methods
    getStatusClass(status) {
        const classes = {
            'active': 'status-active',
            'pending': 'status-pending', 
            'resolved': 'status-resolved',
            'archived': 'status-archived'
        };
        return classes[status] || 'status-default';
    }

    getPriorityClass(priority) {
        const classes = {
            'high': 'priority-high',
            'medium': 'priority-medium',
            'low': 'priority-low'
        };
        return classes[priority] || 'priority-medium';
    }

    formatPriority(priority) {
        const labels = {
            'high': 'Alta',
            'medium': 'Média', 
            'low': 'Baixa'
        };
        return labels[priority] || 'Média';
    }

    formatTimeAgo(timestamp) {
        const now = new Date();
        const time = new Date(timestamp);
        const diffMs = now - time;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Agora';
        if (diffMins < 60) return `${diffMins}min`;
        if (diffHours < 24) return `${diffHours}h`;
        if (diffDays < 7) return `${diffDays}d`;
        return time.toLocaleDateString('pt-BR');
    }

    getMessageIcon(type) {
        const icons = {
            'image': 'image',
            'video': 'video',
            'audio': 'microphone',
            'document': 'file',
            'location': 'map-marker-alt'
        };
        return icons[type] || 'comment';
    }

    truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    // Data management
    async loadConversations() {
        try {
            const token = localStorage.getItem('ubs_token');
            const response = await fetch('/api/admin/conversations', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                this.conversations = data.conversations || [];
                this.filteredConversations = [...this.conversations];
                this.renderConversationsList();
                this.updateStatusCounts();
            } else {
                throw new Error('Failed to load conversations');
            }
        } catch (error) {
            console.error('Error loading conversations:', error);
            this.showErrorState('Unable to load conversations');
        }
    }

    showErrorState(message) {
        if (this.container) {
            this.container.innerHTML = `
                <div class="widget-error">
                    <div class="error-icon">⚠️</div>
                    <div class="error-message">${message}</div>
                    <button class="btn btn-sm btn-primary mt-2" onclick="location.reload()">
                        Reload Page
                    </button>
                </div>
            `;
        }
    }

    updateStatusCounts() {
        const counts = {
            active: this.conversations.filter(c => c.status === 'active').length,
            pending: this.conversations.filter(c => c.status === 'pending').length,
            resolved: this.conversations.filter(c => c.status === 'resolved').length,
            total: this.conversations.length
        };

        Object.keys(counts).forEach(status => {
            const element = document.getElementById(`${this.id}-${status}-count`);
            if (element) element.textContent = counts[status];
        });
    }

    // Auto-refresh functionality
    startAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        
        this.refreshTimer = setInterval(() => {
            this.loadConversations();
        }, this.options.refreshInterval);
    }

    stopAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    // Public methods
    refresh() {
        this.loadConversations();
    }

    filter(filters) {
        this.filteredConversations = this.conversations.filter(conversation => {
            if (filters.status && conversation.status !== filters.status) return false;
            if (filters.tenant && conversation.tenant.id !== filters.tenant) return false;
            if (filters.priority && conversation.priority !== filters.priority) return false;
            if (filters.search) {
                const searchTerm = filters.search.toLowerCase();
                return conversation.customer.name.toLowerCase().includes(searchTerm) ||
                       conversation.customer.phone.includes(searchTerm) ||
                       conversation.lastMessage.content.toLowerCase().includes(searchTerm);
            }
            return true;
        });
        
        this.renderConversationsList();
    }

    destroy() {
        this.stopAutoRefresh();
        super.destroy();
    }
}

// Global functions for demo
window.refreshConversations = function(widgetId) {
    const widget = window.demoWidgets?.conversationsPanel;
    if (widget) {
        widget.refresh();
        console.log('🔄 Conversas atualizadas');
    }
};

window.filterConversations = function(widgetId) {
    const widget = window.demoWidgets?.conversationsPanel;
    if (widget) {
        const filters = {
            status: document.getElementById(`${widgetId}-status-filter`)?.value,
            tenant: document.getElementById(`${widgetId}-tenant-filter`)?.value,
            priority: document.getElementById(`${widgetId}-priority-filter`)?.value,
            time: document.getElementById(`${widgetId}-time-filter`)?.value
        };
        widget.filter(filters);
        console.log('🔍 Filtros aplicados:', filters);
    }
};

window.searchConversations = function(widgetId, searchTerm) {
    const widget = window.demoWidgets?.conversationsPanel;
    if (widget) {
        widget.filter({ search: searchTerm });
        console.log('🔎 Busca aplicada:', searchTerm);
    }
};

window.selectConversation = function(widgetId, conversationId) {
    console.log('💬 Conversa selecionada:', conversationId);
    // Highlight selected conversation
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('selected');
    });
    document.querySelector(`[data-conversation-id="${conversationId}"]`)?.classList.add('selected');
};

window.openConversation = function(conversationId) {
    console.log('🚀 Abrindo conversa:', conversationId);
    // Would open conversation in new window/modal
};

window.markAsRead = function(conversationId) {
    console.log('✅ Marcando como lida:', conversationId);
    // Would update conversation status
};

window.assignConversation = function(conversationId) {
    console.log('👤 Atribuindo conversa:', conversationId);
    // Would show assignment modal
};

window.archiveConversation = function(conversationId) {
    console.log('📦 Arquivando conversa:', conversationId);
    // Would archive conversation
};

window.prioritizeConversation = function(conversationId) {
    console.log('🚩 Priorizando conversa:', conversationId);
    // Would change priority
};

// Export widget
if (typeof window !== 'undefined') {
    window.ConversationsPanelWidget = ConversationsPanelWidget;
}

console.log('✅ Conversations Panel Widget carregado com sucesso!'); 