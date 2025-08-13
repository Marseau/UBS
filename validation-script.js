// SCRIPT DE VALIDAÇÃO FINAL
console.log('🔍 [VALIDAÇÃO] Iniciando teste completo do sistema...');

// Aguardar carregamento do dashboard
setTimeout(() => {
    console.log('📊 [VALIDAÇÃO] Testando elementos DOM...');
    
    // Testar elementos principais
    const elements = ['totalAppointments', 'totalRevenue', 'newCustomers', 'occupancyRate'];
    const results = {};
    
    elements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            const value = element.textContent || element.innerText;
            results[id] = value.trim();
            console.log(`✅ [VALIDAÇÃO] ${id}: "${value.trim()}"`);
        } else {
            results[id] = 'ELEMENTO_NAO_ENCONTRADO';
            console.error(`❌ [VALIDAÇÃO] ${id}: Elemento não encontrado`);
        }
    });
    
    // Resultado final
    console.log('📋 [VALIDAÇÃO] Resultado Final:');
    console.table(results);
    
    // Verificar se os valores são > 0 (dados reais)
    const hasRealData = Object.values(results).some(value => 
        value !== '0' && value !== 'R$ 0' && value !== 'ELEMENTO_NAO_ENCONTRADO' && value !== ''
    );
    
    if (hasRealData) {
        console.log('🎉 [VALIDAÇÃO] SUCESSO! Dashboard mostrando dados reais!');
    } else {
        console.log('⚠️ [VALIDAÇÃO] ATENÇÃO: Dashboard ainda mostra zeros');
    }
    
}, 3000); // Aguarda 3 segundos para carregamento completo

// Também monitorar chamadas da API
const originalFetch = window.fetch;
window.fetch = function(...args) {
    if (args[0].includes('dashboard')) {
        console.log('🌐 [VALIDAÇÃO] Chamada API detectada:', args[0]);
    }
    return originalFetch.apply(this, args);
};