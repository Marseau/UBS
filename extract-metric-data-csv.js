/**
 * Extração do campo metric_data - APENAS período 90d
 * CSV limpo com nomes dos tenants e formatação brasileira
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function extractMetricDataCSV() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('📊 EXTRAÇÃO: Campo metric_data - Período 90d');
    console.log('==========================================\n');
    
    // Tenants solicitados
    const targetTenants = [
        'Bella Vista Spa & Salon',
        'Charme Total BH', 
        'Centro Terapêutico Equilíbrio',
        'Studio Glamour Rio',
        'Clínica Mente Sã'
    ];
    
    try {
        // 1. Buscar tenants
        const { data: tenants } = await client
            .from('tenants')
            .select('id, business_name')
            .in('business_name', targetTenants);
            
        console.log('✅ Tenants encontrados:');
        tenants?.forEach(t => console.log(`   - ${t.business_name}`));
        
        const tenantIds = tenants.map(t => t.id);
        
        // 2. Extrair APENAS período 90d - campo metric_data
        const { data: metrics } = await client
            .from('tenant_metrics')
            .select('tenant_id, period, metric_data, calculated_at')
            .in('tenant_id', tenantIds)
            .eq('period', '90d')  // APENAS 90d
            .eq('metric_type', 'comprehensive')
            .not('metric_data', 'is', null)
            .order('calculated_at', { ascending: false });
            
        console.log(`\n✅ ${metrics?.length || 0} registros metric_data período 90d encontrados`);
        
        if (!metrics || metrics.length === 0) {
            console.log('❌ Nenhum dado metric_data encontrado para período 90d');
            return;
        }
        
        // 3. Analisar estrutura do metric_data
        console.log('\n🔍 Analisando estrutura do metric_data...');
        const sampleMetricData = metrics[0].metric_data || {};
        const availableKeys = Object.keys(sampleMetricData);
        console.log(`   - Chaves disponíveis: ${availableKeys.length}`);
        console.log(`   - Principais: ${availableKeys.slice(0, 8).join(', ')}...`);
        
        // 4. Processar dados metric_data APENAS 90d
        const csvData = [];
        const headers = new Set();
        
        // Adicionar headers básicos
        headers.add('tenant_name');
        headers.add('period');
        headers.add('calculated_at');
        
        // Coletar todos os headers únicos do metric_data
        metrics.forEach(metric => {
            const metricData = metric.metric_data || {};
            Object.keys(metricData).forEach(key => {
                if (typeof metricData[key] === 'object' && metricData[key] !== null) {
                    // Para objetos aninhados
                    Object.keys(metricData[key]).forEach(subKey => {
                        headers.add(`${key}_${subKey}`);
                    });
                } else {
                    headers.add(key);
                }
            });
        });
        
        const headerArray = Array.from(headers).sort();
        console.log(`   - ${headerArray.length} colunas identificadas para CSV`);
        
        // Processar cada registro
        metrics.forEach(metric => {
            const tenant = tenants.find(t => t.id === metric.tenant_id);
            const metricData = metric.metric_data || {};
            
            const row = {
                // IDENTIFICAÇÃO CLARA
                tenant_name: tenant?.business_name || 'Desconhecido',
                period: metric.period, // 90d apenas
                calculated_at: new Date(metric.calculated_at).toLocaleString('pt-BR')
            };
            
            // Processar metric_data
            Object.keys(metricData).forEach(key => {
                const value = metricData[key];
                
                if (typeof value === 'object' && value !== null) {
                    // Objeto aninhado - expandir propriedades
                    Object.keys(value).forEach(subKey => {
                        const subValue = value[subKey];
                        const columnName = `${key}_${subKey}`;
                        row[columnName] = formatBrazilianValue(subValue);
                    });
                } else {
                    // Valor simples
                    row[key] = formatBrazilianValue(value);
                }
            });
            
            csvData.push(row);
        });
        
        // 5. Gerar CSV
        const csvContent = generateCSV(csvData, headerArray);
        const fileName = `metric_data_90d_${new Date().toISOString().split('T')[0]}.csv`;
        
        fs.writeFileSync(fileName, csvContent, 'utf8');
        
        console.log(`\n✅ CSV metric_data gerado: ${fileName}`);
        console.log(`   - ${csvData.length} linhas de dados`);
        console.log(`   - ${headerArray.length} colunas`);
        console.log(`   - APENAS período 90d`);
        console.log(`   - Nomes dos tenants visíveis`);
        
        // 6. Preview dos dados
        console.log('\n📊 PREVIEW metric_data - PERÍODO 90d:');
        console.log('===================================');
        
        csvData.slice(0, 3).forEach((row, i) => {
            console.log(`\n${i+1}. ${row.tenant_name} (${row.period}):`);
            
            // Mostrar algumas métricas principais se disponíveis
            const keys = Object.keys(row);
            keys.slice(3, 8).forEach(key => {
                if (row[key] && row[key] !== '') {
                    console.log(`   ${key}: ${row[key]}`);
                }
            });
        });
        
    } catch (error) {
        console.log(`❌ Erro: ${error.message}`);
        console.log('Stack:', error.stack?.split('\n').slice(0,3).join('\n'));
    }
}

function formatBrazilianValue(value) {
    if (value === null || value === undefined) return '';
    
    // Se for número
    if (typeof value === 'number') {
        if (Number.isInteger(value)) {
            return value.toLocaleString('pt-BR');
        } else {
            return value.toLocaleString('pt-BR', { 
                minimumFractionDigits: 2,
                maximumFractionDigits: 2 
            });
        }
    }
    
    // Se for string que representa número
    if (typeof value === 'string' && !isNaN(parseFloat(value))) {
        const num = parseFloat(value);
        if (Number.isInteger(num)) {
            return num.toLocaleString('pt-BR');
        } else {
            return num.toLocaleString('pt-BR', { 
                minimumFractionDigits: 2,
                maximumFractionDigits: 2 
            });
        }
    }
    
    // Para outros tipos, retornar como string
    return String(value);
}

function generateCSV(data, headers) {
    const csvRows = [];
    
    // Header
    csvRows.push(headers.join(';'));
    
    // Data
    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header] || '';
            const escaped = String(value).replace(/"/g, '""');
            return `"${escaped}"`;
        });
        csvRows.push(values.join(';'));
    });
    
    return csvRows.join('\n');
}

extractMetricDataCSV().catch(console.error);