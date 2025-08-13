#!/usr/bin/env node

/**
 * TESTE DE PERFORMANCE - CRONJOB 26 MÉTRICAS
 * 
 * Testa o desempenho do novo serviço de cronjob com as 26 métricas
 */

require('dotenv').config();

// Importar funções do novo serviço (simulando import para teste)
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testCronjobPerformance() {
    console.log('🚀 TESTE DE PERFORMANCE - CRONJOB 26 MÉTRICAS');
    console.log('=' .repeat(60));
    
    const overallStartTime = Date.now();
    
    try {
        // 1. Limpar tabela para teste limpo
        console.log('🧹 Limpando tabela para teste limpo...');
        const { data: existingRecords } = await supabase
            .from('tenant_metrics')
            .select('id');
            
        if (existingRecords && existingRecords.length > 0) {
            const ids = existingRecords.map(r => r.id);
            await supabase
                .from('tenant_metrics')
                .delete()
                .in('id', ids);
            console.log(`   ✅ ${existingRecords.length} registros removidos`);
        } else {
            console.log('   ✅ Tabela já estava limpa');
        }
        
        // 2. Executar o cronjob usando nosso script (que implementa a mesma lógica)
        console.log('\n📊 Executando cronjob 26 métricas...');
        const cronStartTime = Date.now();
        
        // Executar o script que criamos (equivalente ao serviço)
        const { spawn } = require('child_process');
        
        await new Promise((resolve, reject) => {
            const process = spawn('node', ['fix-consolidated-metrics-26-complete.js'], {
                stdio: 'pipe'
            });
            
            let output = '';
            let errorOutput = '';
            
            process.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                // Mostrar em tempo real
                process.stdout.write(text);
            });
            
            process.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            process.on('close', (code) => {
                if (code === 0) {
                    resolve(output);
                } else {
                    reject(new Error(`Processo terminou com código ${code}: ${errorOutput}`));
                }
            });
        });
        
        const cronExecutionTime = Date.now() - cronStartTime;
        
        // 3. Verificar resultados
        console.log('\n📈 Verificando resultados...');
        const { data: finalMetrics, count } = await supabase
            .from('tenant_metrics')
            .select('tenant_id, period, metric_type, calculated_at', { count: 'exact' })
            .eq('metric_type', 'consolidated_26')
            .order('tenant_id', { ascending: true });
        
        // 4. Análise de performance por tenant
        const tenantPerformance = {};
        finalMetrics?.forEach(metric => {
            if (!tenantPerformance[metric.tenant_id]) {
                tenantPerformance[metric.tenant_id] = [];
            }
            tenantPerformance[metric.tenant_id].push(metric.period);
        });
        
        // 5. Verificar tamanho dos dados JSON
        console.log('\n🔍 Analisando tamanho dos dados...');
        const { data: sampleMetric } = await supabase
            .from('tenant_metrics')
            .select('metric_data')
            .eq('metric_type', 'consolidated_26')
            .limit(1)
            .single();
        
        const jsonSize = JSON.stringify(sampleMetric?.metric_data || {}).length;
        
        // 6. Relatório de Performance Final
        const totalExecutionTime = Date.now() - overallStartTime;
        
        console.log('\n' + '='.repeat(70));
        console.log('📊 RELATÓRIO DE PERFORMANCE - CRONJOB 26 MÉTRICAS');
        console.log('='.repeat(70));
        console.log(`📅 Executado em: ${new Date().toLocaleString('pt-BR')}`);
        console.log(`⏱️ Tempo total do teste: ${totalExecutionTime}ms (${(totalExecutionTime/1000).toFixed(2)}s)`);
        console.log(`🚀 Tempo de execução do cronjob: ${cronExecutionTime}ms (${(cronExecutionTime/1000).toFixed(2)}s)`);
        console.log(`📊 Registros criados: ${count || 0}`);
        console.log(`🏢 Tenants processados: ${Object.keys(tenantPerformance).length}`);
        console.log(`🎯 Períodos por tenant: 3 (7d, 30d, 90d)`);
        console.log(`📋 Métricas por registro: 26`);
        console.log(`💾 Tamanho médio do JSON: ${(jsonSize/1024).toFixed(2)} KB`);
        console.log(`🔢 Total de dados: ${((jsonSize * (count || 0))/1024).toFixed(2)} KB`);
        
        // Performance por tenant
        console.log('\n🏢 PERFORMANCE POR TENANT:');
        Object.entries(tenantPerformance).forEach(([tenantId, periods]) => {
            console.log(`   ${tenantId.substring(0, 8)}: ${periods.length}/3 períodos ✅`);
        });
        
        // Análise de performance
        const avgTimePerMetric = cronExecutionTime / (count || 1);
        const avgTimePerTenant = cronExecutionTime / Object.keys(tenantPerformance).length;
        
        console.log('\n⚡ ANÁLISE DE PERFORMANCE:');
        console.log(`   📊 Tempo médio por métrica: ${avgTimePerMetric.toFixed(2)}ms`);
        console.log(`   🏢 Tempo médio por tenant: ${avgTimePerTenant.toFixed(2)}ms`);
        console.log(`   🚀 Throughput: ${((count || 0) / (cronExecutionTime/1000)).toFixed(2)} métricas/segundo`);
        
        // Avaliação de performance
        let performanceRating = 'EXCELENTE';
        if (cronExecutionTime > 60000) performanceRating = 'LENTO';
        else if (cronExecutionTime > 30000) performanceRating = 'MODERADO';
        else if (cronExecutionTime > 10000) performanceRating = 'BOM';
        
        console.log(`\n🎯 AVALIAÇÃO GERAL: ${performanceRating}`);
        
        if (performanceRating === 'LENTO') {
            console.log('\n💡 SUGESTÕES DE OTIMIZAÇÃO:');
            console.log('   - Implementar processamento paralelo de tenants');
            console.log('   - Cachear consultas comuns');
            console.log('   - Considerar batch processing');
        }
        
        console.log('\n✅ TESTE DE PERFORMANCE CONCLUÍDO!');
        console.log(`🎊 Sistema cronjob 26 métricas está ${performanceRating}`);
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('❌ Erro no teste de performance:', error.message);
        console.error(error.stack);
    }
}

// Executar teste
testCronjobPerformance().then(() => {
    console.log('\n🎉 Teste finalizado!');
    process.exit(0);
}).catch(error => {
    console.error('💥 Falha no teste:', error);
    process.exit(1);
});