/**
 * Análise completa das métricas existentes no campo metric_data
 * Vamos listar TODAS as métricas já implementadas
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function analyzeMetricDataFields() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('📊 ANÁLISE COMPLETA: Métricas em metric_data');
    console.log('==========================================\n');
    
    try {
        // 1. Buscar registros recentes de metric_data
        const { data: metrics } = await client
            .from('tenant_metrics')
            .select('tenant_id, metric_data, calculated_at')
            .eq('metric_type', 'comprehensive')
            .not('metric_data', 'is', null)
            .order('calculated_at', { ascending: false })
            .limit(5);
            
        if (!metrics || metrics.length === 0) {
            console.log('❌ Nenhuma métrica metric_data encontrada');
            return;
        }
        
        console.log(`✅ ${metrics.length} registros metric_data encontrados\n`);
        
        // 2. Coletar todas as chaves únicas
        const allKeys = new Set();
        const keyTypes = {};
        const sampleValues = {};
        
        metrics.forEach(metric => {
            const data = metric.metric_data || {};
            Object.keys(data).forEach(key => {
                allKeys.add(key);
                
                // Capturar tipo e valor exemplo
                const value = data[key];
                keyTypes[key] = typeof value;
                
                if (!sampleValues[key] && value !== null && value !== undefined) {
                    sampleValues[key] = value;
                }
            });
        });
        
        const sortedKeys = Array.from(allKeys).sort();
        
        console.log(`📋 TOTAL DE MÉTRICAS ENCONTRADAS: ${sortedKeys.length}`);
        console.log('='.repeat(50));
        
        // 3. Categorizar métricas por prefixo/padrão
        const categories = {
            'Revenue & Finance': [],
            'Appointments': [],
            'Customers': [],
            'Growth Rates': [],
            'Risk & Health': [],
            'Time & Dates': [],
            'Platform & System': [],
            'Other': []
        };
        
        sortedKeys.forEach(key => {
            const lowerKey = key.toLowerCase();
            
            if (lowerKey.includes('revenue') || lowerKey.includes('cost') || lowerKey.includes('value')) {
                categories['Revenue & Finance'].push(key);
            } else if (lowerKey.includes('appointment')) {
                categories['Appointments'].push(key);
            } else if (lowerKey.includes('customer')) {
                categories['Customers'].push(key);
            } else if (lowerKey.includes('growth') || lowerKey.includes('rate')) {
                categories['Growth Rates'].push(key);
            } else if (lowerKey.includes('risk') || lowerKey.includes('health') || lowerKey.includes('score')) {
                categories['Risk & Health'].push(key);
            } else if (lowerKey.includes('period') || lowerKey.includes('date') || lowerKey.includes('start') || lowerKey.includes('end')) {
                categories['Time & Dates'].push(key);
            } else if (lowerKey.includes('platform') || lowerKey.includes('percentage') || lowerKey.includes('tenant')) {
                categories['Platform & System'].push(key);
            } else {
                categories['Other'].push(key);
            }
        });
        
        // 4. Exibir métricas categorizadas
        Object.entries(categories).forEach(([category, keys]) => {
            if (keys.length > 0) {
                console.log(`\n📊 ${category.toUpperCase()} (${keys.length} métricas):`);
                console.log('─'.repeat(40));
                
                keys.forEach((key, index) => {
                    const type = keyTypes[key];
                    const sample = sampleValues[key];
                    let displayValue = '';
                    
                    if (sample !== undefined) {
                        if (type === 'number') {
                            displayValue = ` = ${sample}`;
                        } else if (type === 'string') {
                            displayValue = ` = "${sample.toString().substring(0, 30)}${sample.toString().length > 30 ? '...' : ''}"`;
                        } else if (type === 'object') {
                            displayValue = ` = ${JSON.stringify(sample).substring(0, 50)}...`;
                        } else {
                            displayValue = ` = ${sample}`;
                        }
                    }
                    
                    console.log(`   ${index + 1}. ${key} (${type})${displayValue}`);
                });
            }
        });
        
        // 5. Análise detalhada de algumas métricas específicas
        console.log('\n🔍 ANÁLISE DETALHADA DE MÉTRICAS ESPECÍFICAS:');
        console.log('===========================================');
        
        const keyMetrics = ['total_revenue', 'monthly_revenue', 'total_appointments', 'new_customers', 'risk_score', 'business_health_score'];
        
        keyMetrics.forEach(keyMetric => {
            if (allKeys.has(keyMetric)) {
                console.log(`\n📊 ${keyMetric.toUpperCase()}:`);
                
                metrics.forEach((metric, i) => {
                    const value = metric.metric_data[keyMetric];
                    const tenantId = metric.tenant_id.substring(0, 8);
                    console.log(`   Tenant ${i+1} (${tenantId}...): ${value}`);
                });
            }
        });
        
        // 6. Verificar consistência entre tenants
        console.log('\n🔄 CONSISTÊNCIA ENTRE TENANTS:');
        console.log('=============================');
        
        const consistencyCheck = {};
        metrics.forEach((metric, i) => {
            const keys = Object.keys(metric.metric_data || {});
            keys.forEach(key => {
                if (!consistencyCheck[key]) {
                    consistencyCheck[key] = [];
                }
                consistencyCheck[key].push(i + 1);
            });
        });
        
        console.log(`\n📊 Métricas presentes em TODOS os ${metrics.length} tenants:`);
        Object.entries(consistencyCheck).forEach(([key, tenants]) => {
            if (tenants.length === metrics.length) {
                console.log(`   ✅ ${key}`);
            }
        });
        
        console.log(`\n⚠️  Métricas INCONSISTENTES (não presentes em todos):`);
        Object.entries(consistencyCheck).forEach(([key, tenants]) => {
            if (tenants.length < metrics.length) {
                console.log(`   ❌ ${key} (presente em ${tenants.length}/${metrics.length} tenants)`);
            }
        });
        
        // 7. Resumo final
        console.log('\n📈 RESUMO FINAL:');
        console.log('===============');
        console.log(`   🎯 Total de métricas únicas: ${sortedKeys.length}`);
        console.log(`   📊 Registros analisados: ${metrics.length}`);
        console.log(`   ✅ Métricas consistentes: ${Object.entries(consistencyCheck).filter(([k, v]) => v.length === metrics.length).length}`);
        console.log(`   ❌ Métricas inconsistentes: ${Object.entries(consistencyCheck).filter(([k, v]) => v.length < metrics.length).length}`);
        
    } catch (error) {
        console.log(`❌ Erro: ${error.message}`);
        console.log('Stack:', error.stack?.split('\n').slice(0,5).join('\n'));
    }
}

analyzeMetricDataFields().catch(console.error);