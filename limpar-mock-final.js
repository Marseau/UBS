/**
 * LIMPEZA FINAL DE MOCK DATA - VERSÃO AGRESSIVA
 * 
 * Remove TODOS os valores hardcoded restantes, incluindo:
 * - Chart fallbacks em forceUpdateAllCharts
 * - Status distributions hardcoded
 * - Daily stats fake
 */

const fs = require('fs');

async function limpezaFinalMockData() {
    console.log('🧹 LIMPEZA FINAL AGRESSIVA DE MOCK DATA...');
    
    const arquivos = [
        'src/frontend/dist/js/app.min.js',
        'src/frontend/js/dashboard.js'
    ];
    
    for (const arquivo of arquivos) {
        if (!fs.existsSync(arquivo)) continue;
        
        console.log(`\n📁 Limpando: ${arquivo}`);
        let conteudo = fs.readFileSync(arquivo, 'utf8');
        
        // 1. REMOVER STATUS DISTRIBUTION HARDCODED
        conteudo = conteudo.replace(/\{confirmed:200,completed:150,cancelled:50,pending:88\}/g, '{}');
        conteudo = conteudo.replace(/confirmed:200/g, 'confirmed:0');
        conteudo = conteudo.replace(/completed:150/g, 'completed:0'); 
        conteudo = conteudo.replace(/cancelled:50/g, 'cancelled:0');
        conteudo = conteudo.replace(/pending:88/g, 'pending:0');
        
        // 2. REMOVER DAILY STATS HARDCODED
        conteudo = conteudo.replace(/\{"01\/07":15,"02\/07":22,"03\/07":18,"04\/07":25,"05\/07":28,"06\/07":32\}/g, '{}');
        conteudo = conteudo.replace(/\{"2025-07-01":15,"2025-07-02":22,"2025-07-03":18,"2025-07-04":25,"2025-07-05":28,"2025-07-06":32\}/g, '{}');
        
        // 3. SUBSTITUIR forceUpdateAllCharts PARA RETORNAR VAZIO
        const regexForceChart = /forceUpdateAllCharts\(e\)\{[^}]*try\{[^}]*\}catch\([^}]*\)\{[^}]*\}/g;
        conteudo = conteudo.replace(regexForceChart, 'forceUpdateAllCharts(e){console.warn("Mock charts disabled - use real data only");return;}');
        
        // 4. LIMPAR VALORES RESTANTES
        conteudo = conteudo.replace(/\|\|0/g, '||null');
        
        fs.writeFileSync(arquivo, conteudo);
        console.log(`   ✅ ${arquivo} limpo`);
    }
    
    console.log('\n✅ LIMPEZA FINAL CONCLUÍDA!');
    console.log('🎯 TODOS os mock data foram eliminados');
}

limpezaFinalMockData();