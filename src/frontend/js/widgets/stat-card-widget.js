// UBS StatCardWidget - Card de Estatística Padronizado
// Uso: new window.StatCardWidget(container, { value, label, color, icon })
(function(global){
class StatCardWidget {
    constructor(container, options = {}) {
        this.container = container;
        this.options = Object.assign({
            value: 0,
            label: '',
            color: 'primary', // primary, success, warning, danger
            icon: '', // ex: 'fas fa-comments'
            id: ''
        }, options);
    }
    render() {
        const colorClass = {
            primary: 'text-primary',
            success: 'text-success',
            warning: 'text-warning',
            danger: 'text-danger',
            info: 'text-info'
        }[this.options.color] || 'text-primary';
        this.container.innerHTML = `
            <div class="stat-card-widget stat-card">
                <div class="stat-number ${colorClass}">
                    ${this.options.icon ? `<i class="${this.options.icon} me-2"></i>` : ''}
                    <span>${this.options.value}</span>
                </div>
                <div class="stat-label">${this.options.label}</div>
            </div>
        `;
    }
}
global.StatCardWidget = StatCardWidget;
})(typeof window !== 'undefined' ? window : this); 