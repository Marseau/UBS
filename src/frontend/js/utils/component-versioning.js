// =====================================================
// COMPONENT VERSIONING SYSTEM
// Controla versões, detecta mudanças e garante integridade de componentes UI
// =====================================================

class ComponentVersionControl {
    constructor() {
        this.componentVersions = {
            'tenant-selector': '1.0.0',
            'metrics-cards': '1.0.0', 
            'charts-section': '1.0.0',
            'ranking-display': '1.0.0',
            'period-selector': '1.0.0',
            'business-info-card': '1.0.0',
            'alert-system': '1.0.0'
        };
        
        this.componentHashes = new Map();
        this.componentStructures = new Map();
        this.changeLog = [];
        
        this.initializeComponents();
    }

    // =====================================================
    // INICIALIZAÇÃO E SETUP
    // =====================================================

    initializeComponents() {
        // Aguardar DOM estar pronto
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.performInitialScan();
            });
        } else {
            this.performInitialScan();
        }
    }

    performInitialScan() {
        console.log('🔍 Iniciando scan inicial de componentes...');
        
        const components = this.getRegisteredComponents();
        let componentsFound = 0;
        
        components.forEach(({ selector, name }) => {
            try {
                const hash = this.generateComponentHash(selector);
                const structure = this.extractStructure(selector);
                
                if (hash && structure) {
                    this.componentHashes.set(name, hash);
                    this.componentStructures.set(name, structure);
                    componentsFound++;
                    
                    console.log(`✅ ${name}: ${hash.substring(0, 8)}...`);
                } else {
                    console.warn(`⚠️ Componente não encontrado: ${name} (${selector})`);
                }
            } catch (error) {
                console.error(`❌ Erro ao processar ${name}:`, error);
            }
        });
        
        console.log(`📊 Scan concluído: ${componentsFound}/${components.length} componentes registrados`);
        this.saveState();
    }

    // =====================================================
    // REGISTRO E CONFIGURAÇÃO DE COMPONENTES
    // =====================================================

    getRegisteredComponents() {
        return [
            { selector: '#tenantSelector', name: 'tenant-selector' },
            { selector: '.metrics-grid', name: 'metrics-cards' },
            { selector: '.charts-section', name: 'charts-section' },
            { selector: '.rankings-section', name: 'ranking-display' },
            { selector: '#periodSelector', name: 'period-selector' },
            { selector: '#businessInfoCard', name: 'business-info-card' },
            { selector: '#noTenantAlert, #tenantSelectionAlert', name: 'alert-system' }
        ];
    }

    registerComponent(selector, name, version = '1.0.0') {
        this.componentVersions[name] = version;
        
        const hash = this.generateComponentHash(selector);
        const structure = this.extractStructure(selector);
        
        if (hash && structure) {
            this.componentHashes.set(name, hash);
            this.componentStructures.set(name, structure);
            
            console.log(`🆕 Componente registrado: ${name} v${version}`);
            this.saveState();
            return true;
        }
        
        console.error(`❌ Falha ao registrar componente: ${name}`);
        return false;
    }

    // =====================================================
    // GERAÇÃO DE HASH E ESTRUTURA
    // =====================================================

    generateComponentHash(selector) {
        const elements = document.querySelectorAll(selector);
        if (elements.length === 0) return null;
        
        const combinedStructure = Array.from(elements).map(element => {
            return this.extractElementSignature(element);
        }).join('|');
        
        return this.hashString(combinedStructure);
    }

    extractElementSignature(element) {
        return {
            tag: element.tagName,
            id: element.id || null,
            classes: Array.from(element.classList).sort(),
            attributes: this.extractCriticalAttributes(element),
            childrenSignature: this.extractChildrenSignature(element),
            textContent: this.extractSignificantText(element)
        };
    }

    extractCriticalAttributes(element) {
        const criticalAttrs = ['data-tenant-id', 'data-chart-type', 'role', 'aria-label', 'aria-labelledby'];
        const attrs = {};
        
        criticalAttrs.forEach(attr => {
            if (element.hasAttribute(attr)) {
                attrs[attr] = element.getAttribute(attr);
            }
        });
        
        return attrs;
    }

    extractChildrenSignature(element) {
        // Apenas estrutura, não conteúdo dinâmico
        return Array.from(element.children).map(child => ({
            tag: child.tagName,
            classes: Array.from(child.classList).sort(),
            id: child.id || null
        }));
    }

    extractSignificantText(element) {
        // Apenas textos estáticos, não dinâmicos
        const staticTexts = [];
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    const text = node.textContent.trim();
                    const parent = node.parentElement;
                    
                    // Ignorar textos dinâmicos
                    if (parent && (
                        parent.matches('[data-dynamic]') ||
                        parent.matches('.metric-value') ||
                        parent.matches('.chart-data') ||
                        text.match(/^\d+(\.\d+)?[%$]?$/) || // Números/percentuais
                        text.match(/^\d{1,2}\/\d{1,2}$/) || // Datas
                        text.length === 0
                    )) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );
        
        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent.trim();
            if (text.length > 0) {
                staticTexts.push(text);
            }
        }
        
        return staticTexts;
    }

    extractStructure(selector) {
        const elements = document.querySelectorAll(selector);
        if (elements.length === 0) return null;
        
        return Array.from(elements).map(element => ({
            selector: this.generateUniqueSelector(element),
            signature: this.extractElementSignature(element),
            position: this.getElementPosition(element),
            computed_styles: this.extractCriticalStyles(element)
        }));
    }

    extractCriticalStyles(element) {
        const computed = window.getComputedStyle(element);
        return {
            display: computed.display,
            position: computed.position,
            width: computed.width,
            height: computed.height,
            backgroundColor: computed.backgroundColor,
            borderRadius: computed.borderRadius,
            fontSize: computed.fontSize,
            fontWeight: computed.fontWeight,
            color: computed.color,
            flexDirection: computed.flexDirection,
            gridTemplateColumns: computed.gridTemplateColumns
        };
    }

    generateUniqueSelector(element) {
        if (element.id) return `#${element.id}`;
        
        const path = [];
        let current = element;
        
        while (current && current.nodeType === Node.ELEMENT_NODE) {
            let selector = current.tagName.toLowerCase();
            
            if (current.className) {
                selector += '.' + Array.from(current.classList).join('.');
            }
            
            path.unshift(selector);
            current = current.parentElement;
            
            if (path.length > 5) break; // Limitar profundidade
        }
        
        return path.join(' > ');
    }

    getElementPosition(element) {
        const rect = element.getBoundingClientRect();
        return {
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        };
    }

    // =====================================================
    // VERIFICAÇÃO DE MUDANÇAS
    // =====================================================

    checkForChanges() {
        console.log('🔍 Verificando mudanças em componentes...');
        
        const changes = [];
        const components = this.getRegisteredComponents();
        
        components.forEach(({ selector, name }) => {
            const change = this.checkComponentChange(selector, name);
            if (change) {
                changes.push(change);
            }
        });

        if (changes.length > 0) {
            this.reportChanges(changes);
            this.saveChangeLog(changes);
        } else {
            console.log('✅ Nenhuma mudança detectada');
        }

        return changes;
    }

    checkComponentChange(selector, componentName) {
        const currentHash = this.generateComponentHash(selector);
        const currentStructure = this.extractStructure(selector);
        const originalHash = this.componentHashes.get(componentName);
        const originalStructure = this.componentStructures.get(componentName);

        if (!currentHash) {
            return {
                component: componentName,
                type: 'MISSING',
                severity: 'CRITICAL',
                message: `Componente ${componentName} não encontrado`,
                selector: selector,
                timestamp: new Date().toISOString()
            };
        }

        if (currentHash !== originalHash) {
            const changeType = this.analyzeChangeType(originalStructure, currentStructure);
            
            return {
                component: componentName,
                type: changeType.type,
                severity: changeType.severity,
                message: changeType.message,
                selector: selector,
                originalHash,
                currentHash,
                details: changeType.details,
                timestamp: new Date().toISOString()
            };
        }

        return null;
    }

    analyzeChangeType(originalStructure, currentStructure) {
        if (!originalStructure || !currentStructure) {
            return {
                type: 'STRUCTURAL',
                severity: 'CRITICAL',
                message: 'Estrutura do componente completamente alterada',
                details: { reason: 'missing_structure' }
            };
        }

        // Comparar quantidade de elementos
        if (originalStructure.length !== currentStructure.length) {
            return {
                type: 'ELEMENT_COUNT',
                severity: 'HIGH',
                message: `Número de elementos alterado: ${originalStructure.length} → ${currentStructure.length}`,
                details: { 
                    original_count: originalStructure.length,
                    current_count: currentStructure.length
                }
            };
        }

        // Comparar estruturas individuais
        for (let i = 0; i < originalStructure.length; i++) {
            const original = originalStructure[i];
            const current = currentStructure[i];
            
            // Verificar mudanças críticas
            const criticalChanges = this.findCriticalChanges(original, current);
            if (criticalChanges.length > 0) {
                return {
                    type: 'CRITICAL_CHANGE',
                    severity: 'CRITICAL',
                    message: `Mudanças críticas detectadas: ${criticalChanges.join(', ')}`,
                    details: { critical_changes: criticalChanges }
                };
            }

            // Verificar mudanças de estilo
            const styleChanges = this.findStyleChanges(original, current);
            if (styleChanges.length > 0) {
                return {
                    type: 'STYLE_CHANGE',
                    severity: 'MEDIUM',
                    message: `Mudanças de estilo detectadas: ${styleChanges.join(', ')}`,
                    details: { style_changes: styleChanges }
                };
            }
        }

        return {
            type: 'MINOR',
            severity: 'LOW',
            message: 'Mudanças menores detectadas',
            details: { reason: 'hash_difference' }
        };
    }

    findCriticalChanges(original, current) {
        const changes = [];
        
        // Tag name mudou
        if (original.signature.tag !== current.signature.tag) {
            changes.push(`tag: ${original.signature.tag} → ${current.signature.tag}`);
        }
        
        // ID mudou
        if (original.signature.id !== current.signature.id) {
            changes.push(`id: ${original.signature.id} → ${current.signature.id}`);
        }
        
        // Classes críticas removidas
        const originalClasses = new Set(original.signature.classes);
        const currentClasses = new Set(current.signature.classes);
        const removedClasses = [...originalClasses].filter(cls => !currentClasses.has(cls));
        
        if (removedClasses.length > 0) {
            changes.push(`classes removidas: ${removedClasses.join(', ')}`);
        }
        
        // Atributos críticos mudaram
        Object.keys(original.signature.attributes).forEach(attr => {
            if (original.signature.attributes[attr] !== current.signature.attributes[attr]) {
                changes.push(`${attr}: ${original.signature.attributes[attr]} → ${current.signature.attributes[attr]}`);
            }
        });
        
        return changes;
    }

    findStyleChanges(original, current) {
        const changes = [];
        const criticalStyles = ['display', 'position', 'backgroundColor', 'fontSize'];
        
        criticalStyles.forEach(style => {
            if (original.computed_styles[style] !== current.computed_styles[style]) {
                changes.push(`${style}: ${original.computed_styles[style]} → ${current.computed_styles[style]}`);
            }
        });
        
        return changes;
    }

    // =====================================================
    // RELATÓRIOS E LOGGING
    // =====================================================

    reportChanges(changes) {
        console.group('🚨 MUDANÇAS DE COMPONENTES DETECTADAS');
        
        changes.forEach(change => {
            const icon = this.getSeverityIcon(change.severity);
            console.log(`${icon} ${change.component}: ${change.message}`);
            
            if (change.details) {
                console.log('   Detalhes:', change.details);
            }
        });
        
        console.groupEnd();
        
        // Enviar para sistema de monitoramento
        this.sendToMonitoring(changes);
        
        // Exibir alerta visual para mudanças críticas
        const criticalChanges = changes.filter(c => c.severity === 'CRITICAL');
        if (criticalChanges.length > 0) {
            this.showCriticalAlert(criticalChanges);
        }
    }

    getSeverityIcon(severity) {
        const icons = {
            'CRITICAL': '🔴',
            'HIGH': '🟠',
            'MEDIUM': '🟡',
            'LOW': '🟢'
        };
        return icons[severity] || '❓';
    }

    sendToMonitoring(changes) {
        // Integração com sistema de monitoramento externo
        if (typeof window.reportComponentChanges === 'function') {
            window.reportComponentChanges(changes);
        }
        
        // Analytics interno
        if (typeof gtag === 'function') {
            changes.forEach(change => {
                gtag('event', 'component_change', {
                    component_name: change.component,
                    change_type: change.type,
                    severity: change.severity
                });
            });
        }
    }

    showCriticalAlert(criticalChanges) {
        // DESABILITADO: Não mostrar alertas visuais desnecessários para o usuário
        console.log('🔇 Critical alert suppressed:', criticalChanges);
        return;
    }

    saveChangeLog(changes) {
        this.changeLog.push(...changes);
        
        // Manter apenas últimas 100 mudanças
        if (this.changeLog.length > 100) {
            this.changeLog = this.changeLog.slice(-100);
        }
        
        this.saveState();
    }

    // =====================================================
    // PERSISTÊNCIA E ESTADO
    // =====================================================

    saveState() {
        const state = {
            versions: this.componentVersions,
            hashes: Object.fromEntries(this.componentHashes),
            structures: Object.fromEntries(this.componentStructures),
            changeLog: this.changeLog.slice(-50), // Últimas 50 mudanças
            lastUpdate: new Date().toISOString()
        };
        
        try {
            localStorage.setItem('componentVersionControl', JSON.stringify(state));
        } catch (error) {
            console.warn('Falha ao salvar estado de versionamento:', error);
        }
    }

    loadState() {
        try {
            const savedState = localStorage.getItem('componentVersionControl');
            if (savedState) {
                const state = JSON.parse(savedState);
                
                this.componentVersions = { ...this.componentVersions, ...state.versions };
                this.componentHashes = new Map(Object.entries(state.hashes || {}));
                this.componentStructures = new Map(Object.entries(state.structures || {}));
                this.changeLog = state.changeLog || [];
                
                console.log('✅ Estado de versionamento carregado');
                return true;
            }
        } catch (error) {
            console.warn('Falha ao carregar estado de versionamento:', error);
        }
        
        return false;
    }

    // =====================================================
    // UTILITÁRIOS
    // =====================================================

    hashString(str) {
        let hash = 0;
        if (str.length === 0) return hash.toString(16);
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        return Math.abs(hash).toString(16);
    }

    // =====================================================
    // API PÚBLICA
    // =====================================================

    approveChanges(componentName) {
        const components = this.getRegisteredComponents();
        const component = components.find(c => c.name === componentName);
        
        if (component) {
            const newHash = this.generateComponentHash(component.selector);
            const newStructure = this.extractStructure(component.selector);
            
            if (newHash && newStructure) {
                this.componentHashes.set(componentName, newHash);
                this.componentStructures.set(componentName, newStructure);
                this.saveState();
                
                console.log(`✅ Mudanças aprovadas para ${componentName}`);
                return true;
            }
        }
        
        console.error(`❌ Falha ao aprovar mudanças para ${componentName}`);
        return false;
    }

    getComponentStatus(componentName) {
        const change = this.checkComponentChange(
            this.getRegisteredComponents().find(c => c.name === componentName)?.selector,
            componentName
        );
        
        return {
            version: this.componentVersions[componentName],
            hasChanges: !!change,
            change: change,
            lastUpdate: this.componentHashes.has(componentName) ? 'Monitorado' : 'Não monitorado'
        };
    }

    getAllComponentsStatus() {
        const status = {};
        Object.keys(this.componentVersions).forEach(name => {
            status[name] = this.getComponentStatus(name);
        });
        return status;
    }

    getChangeLog() {
        return [...this.changeLog];
    }

    clearChangeLog() {
        this.changeLog = [];
        this.saveState();
    }

    // Método para debug
    debugInfo() {
        return {
            versions: this.componentVersions,
            monitoredComponents: Array.from(this.componentHashes.keys()),
            changeCount: this.changeLog.length,
            lastChanges: this.changeLog.slice(-5)
        };
    }
}

// =====================================================
// INICIALIZAÇÃO GLOBAL
// =====================================================

// Criar instância global
window.componentVersionControl = new ComponentVersionControl();

// Carregar estado salvo
window.componentVersionControl.loadState();

// Verificar mudanças periodicamente
setInterval(() => {
    if (document.readyState === 'complete') {
        window.componentVersionControl.checkForChanges();
    }
}, 30000); // A cada 30 segundos

// Verificar mudanças ao carregar página
window.addEventListener('load', () => {
    setTimeout(() => {
        window.componentVersionControl.checkForChanges();
    }, 2000);
});

// API pública para desenvolvimento
window.approveComponentChanges = (componentName) => {
    return window.componentVersionControl.approveChanges(componentName);
};

window.getComponentsStatus = () => {
    return window.componentVersionControl.getAllComponentsStatus();
};

window.getComponentChangeLog = () => {
    return window.componentVersionControl.getChangeLog();
};

// Export para módulos ES6 se necessário
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ComponentVersionControl;
}

console.log('🔧 Component Version Control System carregado e ativo');