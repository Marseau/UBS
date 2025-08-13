/**
 * Extração do campo metric_type - APENAS período 90d
 * CSV limpo com nomes dos tenants
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function extractMetricTypeCSV() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('📊 EXTRAÇÃO: Campo metric_type - Período 90d');
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
        
        // 2. Extrair APENAS período 90d - campo metric_type
        const { data: metrics } = await client
            .from('tenant_metrics')
            .select('tenant_id, period, metric_type, calculated_at, created_at, updated_at')
            .in('tenant_id', tenantIds)
            .eq('period', '90d')  // APENAS 90d
            .order('calculated_at', { ascending: false });
            
        console.log(`\n✅ ${metrics?.length || 0} registros metric_type período 90d encontrados`);
        
        if (!metrics || metrics.length === 0) {
            console.log('❌ Nenhum dado metric_type encontrado para período 90d');
            return;
        }
        
        // 3. Analisar tipos únicos de metric_type
        const uniqueTypes = [...new Set(metrics.map(m => m.metric_type))];
        console.log(`\n🔍 Tipos de metric_type encontrados: ${uniqueTypes.join(', ')}`);
        
        // 4. Processar dados metric_type APENAS 90d
        const csvData = [];
        
        metrics.forEach(metric => {
            const tenant = tenants.find(t => t.id === metric.tenant_id);
            
            const row = {
                // IDENTIFICAÇÃO CLARA
                tenant_name: tenant?.business_name || 'Desconhecido',
                tenant_id: metric.tenant_id.substring(0,8) + '...',
                period: metric.period, // 90d apenas
                metric_type: metric.metric_type,
                
                // TIMESTAMPS
                calculated_at: new Date(metric.calculated_at).toLocaleString('pt-BR'),
                created_at: new Date(metric.created_at).toLocaleString('pt-BR'),
                updated_at: new Date(metric.updated_at).toLocaleString('pt-BR')
            };
            
            csvData.push(row);
        });
        
        // 5. Gerar CSV
        const headers = ['tenant_name', 'tenant_id', 'period', 'metric_type', 'calculated_at', 'created_at', 'updated_at'];
        const csvContent = generateCSV(csvData, headers);
        const fileName = `metric_type_90d_${new Date().toISOString().split('T')[0]}.csv`;
        
        fs.writeFileSync(fileName, csvContent, 'utf8');
        
        console.log(`\n✅ CSV metric_type gerado: ${fileName}`);
        console.log(`   - ${csvData.length} linhas de dados`);
        console.log(`   - ${headers.length} colunas`);
        console.log(`   - APENAS período 90d`);
        console.log(`   - Nomes dos tenants visíveis`);
        
        // 6. Preview dos dados
        console.log('\n📊 PREVIEW metric_type - PERÍODO 90d:');
        console.log('====================================');
        
        csvData.forEach((row, i) => {
            console.log(`${i+1}. ${row.tenant_name} (${row.period}) - Tipo: ${row.metric_type}`);
            console.log(`   Calculado: ${row.calculated_at}`);
        });
        
        // 7. Estatísticas
        const typeStats = csvData.reduce((acc, row) => {
            acc[row.metric_type] = (acc[row.metric_type] || 0) + 1;
            return acc;
        }, {});
        
        console.log('\n📈 ESTATÍSTICAS metric_type:');
        console.log('============================');
        Object.entries(typeStats).forEach(([type, count]) => {
            console.log(`   ${type}: ${count} registros`);
        });
        
    } catch (error) {
        console.log(`❌ Erro: ${error.message}`);
        console.log('Stack:', error.stack?.split('\n').slice(0,3).join('\n'));
    }
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

extractMetricTypeCSV().catch(console.error);