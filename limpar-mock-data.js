/**
 * SCRIPT PARA ELIMINAR COMPLETAMENTE TODOS OS MOCK DATA
 * 
 * Remove todos os valores hardcoded/fake dos arquivos críticos:
 * - app.min.js: 488, 170, 87450, 78, 15.5, 8.3, 12.7, 2.1
 * - Fallbacks fake em charts e métricas
 * - Valores hardcoded em funções forceUpdateValues
 */

const fs = require('fs');
const path = require('path');

const ARQUIVOS_CRITICOS = [
    'src/frontend/dist/js/app.min.js',
    'src/frontend/js/dashboard.js', 
    'src/frontend/js/super-admin-dashboard.js',
    'src/frontend/js/tenant-admin-dashboard.js',
    'src/routes/admin.js',
    'src/services/analytics.service.ts'
];

const VALORES_MOCK_PARA_REMOVER = [
    // Valores principais do forceUpdateValues
    '488', '170', '87450', '78', 
    '15.5', '8.3', '12.7', '2.1',
    
    // Chart fallbacks
    'confirmed:200', 'completed:150', 'cancelled:50', 'pending:88',
    '"01/07":15', '"02/07":22', '"03/07":18', '"04/07":25', '"05/07":28', '"06/07":32',
    
    // Outros hardcoded
    'e.appointments?.total||488',
    'e.appointments?.growthRate||15.5',
    'e.customers?.total||e.customers?.new||170', 
    'e.customers?.growthRate||8.3',
    'e.revenue?.total||87450',
    'e.revenue?.growthRate||12.7',
    'e.conversion?.rate||78',
    'e.conversion?.growthRate||2.1'
];

async function eliminarMockData() {
    console.log('🧹 INICIANDO ELIMINAÇÃO COMPLETA DE MOCK DATA...');
    console.log('='.repeat(60));
    
    const resultados = {
        arquivosProcessados: 0,
        arquivosModificados: 0,
        valoresRemovidos: 0,
        erros: []
    };
    
    for (const arquivo of ARQUIVOS_CRITICOS) {
        try {
            console.log(`\n📁 Processando: ${arquivo}`);
            
            if (!fs.existsSync(arquivo)) {
                console.log(`   ⚠️  Arquivo não encontrado: ${arquivo}`);
                continue;
            }
            
            let conteudo = fs.readFileSync(arquivo, 'utf8');
            const conteudoOriginal = conteudo;
            let modificacoes = 0;
            
            // 1. REMOVER FUNÇÃO forceUpdateValues COMPLETA
            const regexForceUpdate = /forceUpdateValues\s*\([^}]*\{[^}]*\}/gs;
            if (regexForceUpdate.test(conteudo)) {
                conteudo = conteudo.replace(regexForceUpdate, `forceUpdateValues(e) {
                    // MOCK DATA REMOVIDO - usar apenas dados reais da API
                    console.warn('⚠️ forceUpdateValues chamado sem dados da API');
                    return;
                }`);
                modificacoes++;
                console.log('   ✅ Função forceUpdateValues removida');
            }
            
            // 2. REMOVER updateMainMetrics COM VALORES HARDCODED
            const regexUpdateMain = /updateMainMetrics\s*\([^}]*\{[^}]*\}/gs;
            if (regexUpdateMain.test(conteudo)) {
                conteudo = conteudo.replace(regexUpdateMain, `updateMainMetrics() {
                    // MOCK DATA REMOVIDO - usar apenas dados reais da API
                    console.warn('⚠️ updateMainMetrics chamado sem dados reais');
                    return;
                }`);
                modificacoes++;
                console.log('   ✅ Função updateMainMetrics limpa');
            }
            
            // 3. REMOVER FALLBACKS HARDCODED EM CHARTS
            const fallbacksChart = [
                /\{confirmed:200,completed:150,cancelled:50,pending:88\}/g,
                /\{"01\/07":15,"02\/07":22,"03\/07":18,"04\/07":25,"05\/07":28,"06\/07":32\}/g
            ];
            
            fallbacksChart.forEach(regex => {
                if (regex.test(conteudo)) {
                    conteudo = conteudo.replace(regex, '{}');
                    modificacoes++;
                    console.log('   ✅ Fallback de chart removido');
                }
            });
            
            // 4. REMOVER VALORES HARDCODED ESPECÍFICOS
            VALORES_MOCK_PARA_REMOVER.forEach(valor => {
                const ocorrencias = (conteudo.match(new RegExp(valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
                if (ocorrencias > 0) {
                    // Para valores numéricos simples, substituir por 0
                    if (/^\d+(\.\d+)?$/.test(valor)) {
                        conteudo = conteudo.replace(new RegExp(valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '0');
                    } else {
                        // Para expressões complexas, remover completamente
                        conteudo = conteudo.replace(new RegExp(valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
                    }
                    modificacoes += ocorrencias;
                    resultados.valoresRemovidos += ocorrencias;
                    console.log(`   ✅ Removido "${valor}" (${ocorrencias}x)`);
                }
            });
            
            // 5. REMOVER FALLBACKS COM ||
            const regexFallbacks = [
                /\|\|\s*488/g,
                /\|\|\s*170/g, 
                /\|\|\s*87450/g,
                /\|\|\s*78/g,
                /\|\|\s*15\.5/g,
                /\|\|\s*8\.3/g,
                /\|\|\s*12\.7/g,
                /\|\|\s*2\.1/g
            ];
            
            regexFallbacks.forEach(regex => {
                const matches = conteudo.match(regex);
                if (matches) {
                    conteudo = conteudo.replace(regex, '|| 0');
                    modificacoes += matches.length;
                    console.log(`   ✅ Fallback hardcoded removido (${matches.length}x)`);
                }
            });
            
            // 6. SALVAR ARQUIVO SE HOUVE MODIFICAÇÕES
            if (conteudo !== conteudoOriginal) {
                fs.writeFileSync(arquivo, conteudo);
                resultados.arquivosModificados++;
                console.log(`   🎉 Arquivo modificado com ${modificacoes} alterações`);
            } else {
                console.log('   ℹ️  Nenhuma modificação necessária');
            }
            
            resultados.arquivosProcessados++;
            
        } catch (error) {
            const erro = `Erro ao processar ${arquivo}: ${error.message}`;
            resultados.erros.push(erro);
            console.error(`   ❌ ${erro}`);
        }
    }
    
    // 7. RELATÓRIO FINAL
    console.log('\n' + '='.repeat(60));
    console.log('📊 RELATÓRIO FINAL DE LIMPEZA:');
    console.log(`   📁 Arquivos processados: ${resultados.arquivosProcessados}`);
    console.log(`   ✏️  Arquivos modificados: ${resultados.arquivosModificados}`);
    console.log(`   🗑️  Valores removidos: ${resultados.valoresRemovidos}`);
    console.log(`   ❌ Erros: ${resultados.erros.length}`);
    
    if (resultados.erros.length > 0) {
        console.log('\n🚨 ERROS ENCONTRADOS:');
        resultados.erros.forEach(erro => console.log(`   - ${erro}`));
    }
    
    console.log('\n✅ LIMPEZA DE MOCK DATA CONCLUÍDA!');
    console.log('🎯 Agora todos os dashboards usarão apenas dados reais da API');
    
    return resultados;
}

// Executar limpeza
if (require.main === module) {
    eliminarMockData()
        .then((resultados) => {
            if (resultados.arquivosModificados > 0) {
                console.log('\n🚀 PRÓXIMOS PASSOS:');
                console.log('   1. npm run build (rebuild do frontend)');
                console.log('   2. Testar dashboard sem mock data');
                console.log('   3. Validar que apenas APIs reais são usadas');
            }
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Erro fatal na limpeza:', error);
            process.exit(1);
        });
}

module.exports = { eliminarMockData };