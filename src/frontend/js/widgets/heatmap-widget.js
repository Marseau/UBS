// UBS HeatmapWidget - Painel de Monitoramento Operacional (tipo conversations.html)
(function(global){
class HeatmapWidget {
    constructor(container, data, options = {}) {
        this.container = container;
        this.data = data; // [{ tenant, numbers: [{ number, status, lastMessage, sla, ... }] }]
        this.options = Object.assign({}, options);
        this._interval = null;
        this.render();
        this.startAutoRefresh();
    }

    static statusColors = {
        excelente: '#4CAF50', // verde
        bom: '#8BC34A',       // verde claro
        atencao: '#FFC107',   // amarelo
        critico: '#F44336',   // vermelho
        sem_conversa: '#BDBDBD', // cinza
    };

    getStatusColor(status) {
        return HeatmapWidget.statusColors[status] || '#222';
    }

    render() {
        this.container.innerHTML = '';
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.background = 'none';
        table.style.fontFamily = 'Inter, sans-serif';
        table.style.fontSize = '16px';

        // Cabeçalho
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        const thTenant = document.createElement('th');
        thTenant.innerText = 'Tenant';
        thTenant.style.textAlign = 'left';
        thTenant.style.fontWeight = '700';
        thTenant.style.padding = '6px 12px 6px 0';
        thTenant.style.background = 'none';
        thTenant.style.border = 'none';
        headRow.appendChild(thTenant);
        const thNumbers = document.createElement('th');
        thNumbers.innerText = '';
        thNumbers.style.background = 'none';
        thNumbers.style.border = 'none';
        headRow.appendChild(thNumbers);
        thead.appendChild(headRow);
        table.appendChild(thead);

        // Corpo
        const tbody = document.createElement('tbody');
        this.data.forEach(row => {
            const tr = document.createElement('tr');
            // Tenant
            const tdTenant = document.createElement('td');
            tdTenant.innerText = row.tenant;
            tdTenant.style.fontWeight = '600';
            tdTenant.style.padding = '6px 12px 6px 0';
            tdTenant.style.background = 'none';
            tdTenant.style.border = 'none';
            tr.appendChild(tdTenant);
            // Números conectados (todos juntos em uma célula)
            const tdNumbers = document.createElement('td');
            tdNumbers.style.padding = '0';
            tdNumbers.style.background = 'none';
            tdNumbers.style.border = 'none';
            tdNumbers.style.textAlign = 'left';
            if (row.numbers && row.numbers.length > 0) {
                row.numbers.forEach(numObj => {
                    const btn = document.createElement('span');
                    btn.innerText = numObj.number;
                    btn.style.display = 'inline-block';
                    btn.style.background = this.getStatusColor(numObj.status);
                    btn.style.color = (numObj.status === 'atencao' || numObj.status === 'bom') ? '#222' : '#fff';
                    btn.style.fontWeight = '600';
                    btn.style.fontSize = '15px';
                    btn.style.padding = '2px 8px';
                    btn.style.borderRadius = '7px';
                    btn.style.marginRight = '0';
                    btn.style.marginLeft = '0';
                    btn.style.marginBottom = '0';
                    btn.style.verticalAlign = 'middle';
                    btn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
                    btn.style.cursor = 'pointer';
                    btn.tabIndex = 0;
                    btn.setAttribute('role', 'button');
                    btn.setAttribute('aria-label', `Ver detalhes de ${numObj.number}`);
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        this.openDetail(numObj, row.tenant);
                    };
                    btn.onkeydown = (e) => {
                        if (e.key === 'Enter' || e.key === ' ') this.openDetail(numObj, row.tenant);
                    };
                    tdNumbers.appendChild(btn);
                });
            }
            tr.appendChild(tdNumbers);
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        this.container.appendChild(table);
        this.renderModal();
    }

    openDetail(numberObj, tenant) {
        this.selected = { ...numberObj, tenant };
        this.renderModal();
    }

    closeModal() {
        this.selected = null;
        this.renderModal();
    }

    renderModal() {
        let modal = document.querySelector('.heatmap-modal');
        if (modal) modal.remove();
        if (!this.selected) return;
        modal = document.createElement('div');
        modal.className = 'heatmap-modal';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.background = 'rgba(0,0,0,0.18)';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.zIndex = '9999';
        modal.innerHTML = `
            <div style="background:#fff;min-width:320px;max-width:96vw;padding:32px 24px 24px 24px;border-radius:16px;box-shadow:0 4px 32px rgba(0,0,0,0.13);position:relative;font-family:Inter,sans-serif;">
                <button style="position:absolute;top:16px;right:16px;background:none;border:none;font-size:22px;cursor:pointer;color:#888;" aria-label="Fechar" tabindex="0">×</button>
                <div style="font:700 20px Inter,sans-serif;margin-bottom:8px;">${this.selected.tenant || 'Tenant'}</div>
                <div style="font:600 16px Inter,sans-serif;margin-bottom:4px;">${this.selected.number}</div>
                <div style="margin-bottom:12px;font-size:14px;color:#666;">Status: <span style="color:${this.getStatusColor(this.selected.status)};font-weight:600;text-transform:capitalize;">${this.selected.status.replace('_',' ')}</span></div>
                <div style="margin-bottom:8px;font-size:14px;"><b>Última mensagem:</b><br>${this.selected.lastMessage || '-'}</div>
                <div style="margin-bottom:8px;font-size:14px;"><b>SLA:</b> ${this.selected.sla || '-'}</div>
                <div style="margin-bottom:8px;font-size:14px;"><b>Outros dados:</b> ${this.selected.extra || '-'}</div>
            </div>
        `;
        modal.querySelector('button').onclick = () => this.closeModal();
        modal.onclick = (e) => { if (e.target === modal) this.closeModal(); };
        document.body.appendChild(modal);
    }

    startAutoRefresh() {
        if (this._interval) clearInterval(this._interval);
        this._interval = setInterval(() => {
            if (typeof this.options.onRefresh === 'function') {
                // Permite buscar dados atualizados do backend
                Promise.resolve(this.options.onRefresh()).then(newData => {
                    if (newData) this.data = newData;
                    this.render();
                });
            } else {
                this.render();
            }
        }, 10000);
    }

    destroy() {
        if (this._interval) clearInterval(this._interval);
        let modal = document.querySelector('.heatmap-modal');
        if (modal) modal.remove();
        this.container.innerHTML = '';
    }
}
global.HeatmapWidget = HeatmapWidget;
})(typeof window !== 'undefined' ? window : this); 

function initializeHeatmapDemo() {
    // ... já existem os cards ...

    // Dados mock para o heatmap
    const tenants = [
        { id: 't1', name: 'Salão Bella Vista', whatsapp: '+55 11 99999-1234' },
        { id: 't2', name: 'Clínica Dr. Silva', whatsapp: '+55 11 99999-5678' }
    ];
    const users = ['+55 11 98888-1111', '+55 11 97777-2222', '+55 11 96666-3333'];
    const conversations = [
        { tenantId: 't1', userPhone: '+55 11 98888-1111', status: 'excellent', messageCount: 12, lastMessageTime: 2, lastMessage: 'Olá, tudo bem?', tenantName: 'Salão Bella Vista' },
        { tenantId: 't1', userPhone: '+55 11 97777-2222', status: 'warning', messageCount: 7, lastMessageTime: 15, lastMessage: 'Preciso reagendar', tenantName: 'Salão Bella Vista' },
        { tenantId: 't2', userPhone: '+55 11 96666-3333', status: 'danger', messageCount: 3, lastMessageTime: 25, lastMessage: 'Aguardando retorno', tenantName: 'Clínica Dr. Silva' }
    ];

    // Renderizar o heatmap
    const heatmapContainer = document.createElement('div');
    document.getElementById('heatmap-demo').querySelector('.demo-section').appendChild(heatmapContainer);
    const heatmap = new window.HeatmapWidget(heatmapContainer, { tenants, users, conversations });
    heatmap.render();
} 

 

// Heatmap widget initialization should be done via API data, not mock data 