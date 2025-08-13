/**
 * Extrator de métricas validadas para CSV - COLEAM00
 * Extrai dados JSONB metricas_validadas para tenants específicos
 * Formatação brasileira de números
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function extractValidatedMetricsToCSV() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('📊 EXTRAÇÃO CSV: Métricas Validadas - Período 90d');
    console.log('===============================================\n');
    
    // Tenants solicitados
    const targetTenants = [
        'Bella Vista Spa & Salon',
        'Charme Total BH', 
        'Centro Terapêutico Equilíbrio',
        'Studio Glamour Rio',
        'Clínica Mente Sã'
    ];
    
    try {
        // 1. Buscar IDs dos tenants pelo business_name
        console.log('🔍 PASSO 1: Identificando IDs dos tenants...');
        const { data: tenants, error: tenantsError } = await client
            .from('tenants')
            .select('id, business_name')
            .in('business_name', targetTenants);
            
        if (tenantsError) throw tenantsError;
        
        console.log(`✅ ${tenants?.length || 0} tenants encontrados:`);
        tenants?.forEach(t => {
            console.log(`   - ${t.business_name} (${t.id.substring(0,8)}...)`);
        });
        
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant encontrado com os nomes fornecidos');
            return;
        }
        
        const tenantIds = tenants.map(t => t.id);
        
        // 2. Extrair métricas validadas para período 90d
        console.log('\n📊 PASSO 2: Extraindo métricas para período 90d...');
        const { data: metrics, error: metricsError } = await client
            .from('tenant_metrics')
            .select('tenant_id, period, metricas_validadas, calculated_at')
            .in('tenant_id', tenantIds)
            .eq('period', '90d')
            .eq('metric_type', 'comprehensive')
            .not('metricas_validadas', 'is', null)
            .order('calculated_at', { ascending: false });
            
        if (metricsError) throw metricsError;
        
        console.log(`✅ ${metrics?.length || 0} registros de métricas encontrados`);
        
        if (!metrics || metrics.length === 0) {
            console.log('❌ Nenhuma métrica validada encontrada para o período 90d');
            return;
        }
        
        // 3. Processar e formatar dados para CSV
        console.log('\n📝 PASSO 3: Processando dados para CSV...');
        
        const csvData = [];
        const headers = new Set();
        
        // Coletar todos os headers únicos das métricas
        metrics.forEach(metric => {
            const tenantName = tenants.find(t => t.id === metric.tenant_id)?.business_name || 'Desconhecido';
            const validatedMetrics = metric.metricas_validadas || {};
            
            // Adicionar headers básicos
            headers.add('tenant_name');
            headers.add('tenant_id'); 
            headers.add('period');
            headers.add('calculated_at');
            
            // Adicionar headers das métricas validadas
            Object.keys(validatedMetrics).forEach(key => {
                if (typeof validatedMetrics[key] === 'object' && validatedMetrics[key] !== null) {
                    // Para objetos aninhados, criar headers específicos
                    Object.keys(validatedMetrics[key]).forEach(subKey => {
                        headers.add(`${key}_${subKey}`);
                    });
                } else {
                    headers.add(key);
                }
            });
        });
        
        const headerArray = Array.from(headers).sort();
        console.log(`   - ${headerArray.length} colunas identificadas`);
        console.log(`   - Principais: ${headerArray.slice(0,5).join(', ')}...`);
        
        // Processar cada registro de métrica
        metrics.forEach(metric => {
            const tenantName = tenants.find(t => t.id === metric.tenant_id)?.business_name || 'Desconhecido';
            const validatedMetrics = metric.metricas_validadas || {};
            
            const row = {
                tenant_name: tenantName,
                tenant_id: metric.tenant_id.substring(0,8) + '...',
                period: metric.period,
                calculated_at: new Date(metric.calculated_at).toLocaleString('pt-BR')
            };
            
            // Processar métricas validadas
            Object.keys(validatedMetrics).forEach(key => {
                const value = validatedMetrics[key];
                
                if (typeof value === 'object' && value !== null) {
                    // Objeto aninhado - expandir propriedades
                    Object.keys(value).forEach(subKey => {
                        const subValue = value[subKey];
                        const columnName = `${key}_${subKey}`;
                        row[columnName] = formatBrazilianNumber(subValue);
                    });
                } else {
                    // Valor simples
                    row[key] = formatBrazilianNumber(value);
                }
            });
            
            csvData.push(row);
        });
        
        // 4. Gerar CSV
        console.log('\n📄 PASSO 4: Gerando arquivo CSV...');
        
        const csvContent = generateCSV(csvData, headerArray);
        const fileName = `metricas_validadas_90d_${new Date().toISOString().split('T')[0]}.csv`;
        
        fs.writeFileSync(fileName, csvContent, 'utf8');
        
        console.log(`✅ CSV gerado com sucesso: ${fileName}`);
        console.log(`   - ${csvData.length} linhas de dados`);
        console.log(`   - ${headerArray.length} colunas`);
        console.log(`   - Formatação brasileira aplicada`);
        
        // 5. Mostrar preview dos dados
        console.log('\n📋 PREVIEW DOS DADOS:');
        console.log('====================');
        csvData.slice(0, 2).forEach((row, i) => {
            console.log(`\n${i+1}. ${row.tenant_name}:`);
            console.log(`   - Monthly Revenue: ${row.monthly_revenue || 'N/A'}`);
            console.log(`   - New Customers: ${row.new_customers || 'N/A'}`);
            console.log(`   - Spam Rate: ${row.spam_rate_percentage || 'N/A'}`);
            console.log(`   - Success Rate: ${row.appointment_success_rate || 'N/A'}`);
        });
        
    } catch (error) {
        console.log(`❌ Erro na extração: ${error.message}`);
        console.log('Stack:', error.stack?.split('\n').slice(0,3).join('\n'));
    }
}

/**
 * Formatar números para padrão brasileiro
 */
function formatBrazilianNumber(value) {
    if (value === null || value === undefined) return '';
    
    // Se for número
    if (typeof value === 'number') {
        if (Number.isInteger(value)) {
            // Integer - usar ponto para milhares
            return value.toLocaleString('pt-BR');
        } else {
            // Float - usar vírgula para decimal e ponto para milhares
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

/**
 * Gerar conteúdo CSV
 */
function generateCSV(data, headers) {
    const csvRows = [];
    
    // Header
    csvRows.push(headers.join(';')); // Usar ; como separador para Excel brasileiro
    
    // Data rows
    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header] || '';
            // Escapar aspas e quebras de linha
            const escaped = String(value).replace(/"/g, '""');
            return `"${escaped}"`; // Always quote to handle commas in values
        });
        csvRows.push(values.join(';'));
    });
    
    return csvRows.join('\n');
}

extractValidatedMetricsToCSV().catch(console.error);