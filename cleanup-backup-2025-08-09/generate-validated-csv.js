require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function generateValidatedCSV() {
    console.log('📊 Gerando CSV VALIDADO com dados corretos...');
    
    // Buscar métricas mais recentes (de hoje)
    const today = new Date().toISOString().split('T')[0];
    
    const { data: tenantMetrics, error } = await supabase
        .from('tenant_metrics')
        .select(`
            *,
            tenants!inner(name, domain)
        `)
        .gte('calculated_at', today)
        .order('tenant_id', { ascending: true })
        .order('period', { ascending: true });
        
    if (error) {
        console.error('❌ Erro:', error);
        return;
    }
    
    console.log(`✅ Encontrados ${tenantMetrics.length} registros de hoje`);
    
    if (tenantMetrics.length === 0) {
        console.log('⚠️ Nenhum registro de hoje encontrado. Buscando os mais recentes...');
        
        const { data: recentMetrics, error: recentError } = await supabase
            .from('tenant_metrics')
            .select(`
                *,
                tenants!inner(name, domain)
            `)
            .order('calculated_at', { ascending: false })
            .limit(30);
            
        if (recentError) {
            console.error('❌ Erro buscando recentes:', recentError);
            return;
        }
        
        console.log(`✅ Usando ${recentMetrics.length} registros mais recentes`);
        tenantMetrics.splice(0, 0, ...recentMetrics);
    }
    
    // Cabeçalho CSV com nomes descritivos
    const headers = [
        'Nome do Tenant',
        'Dominio',
        'Periodo',
        'Data Calculo',
        'Minutos Medios por Conversa',
        'Total Minutos',
        'Total Conversas (Minutos)',
        'Mensagens Medias por Conversa', 
        'Total Mensagens',
        'Total Conversas (Mensagens)',
        'Custo USD Medio por Conversa',
        'Custo USD Total',
        'Total Conversas (Custo)',
        'Confidence Score Medio',
        'Confidence Total',
        'Total Conversas (Confidence)',
        'Clientes Unicos',
        'Servicos Disponiveis',
        'Profissionais',
        'Custo Mensal Plataforma (BRL)',
        'Historico 6M - Conversas',
        'Historico 6M - Revenue',
        'Historico 6M - Clientes'
    ];
    
    let csvContent = headers.join(';') + '\n';
    
    // Processar cada registro
    for (const metric of tenantMetrics) {
        const data = metric.metric_data || {};
        const tenant = metric.tenants || {};
        
        // Formatar arrays de histórico 6 meses
        const formatArray = (arr) => {
            if (!arr || !Array.isArray(arr)) return '[]';
            return JSON.stringify(arr.map(item => 
                typeof item === 'object' ? 
                `${item.month || ''}: ${(item.value || 0).toString().replace('.', ',')}` : 
                (item || 0).toString().replace('.', ',')
            ));
        };
        
        const row = [
            tenant.name || 'Nome não encontrado',
            tenant.domain || '',
            metric.period || '',
            new Date(metric.calculated_at).toLocaleString('pt-BR'),
            // Minutos médios por conversa
            (data.avg_minutes_per_conversation?.minutes || 0).toFixed(2).replace('.', ','),
            (data.avg_minutes_per_conversation?.total_minutes || 0).toFixed(2).replace('.', ','),
            (data.avg_minutes_per_conversation?.total_conversations || 0).toString(),
            // Mensagens médias por conversa
            (data.avg_messages_per_conversation?.messages || 0).toFixed(2).replace('.', ','),
            (data.avg_messages_per_conversation?.total_messages || 0).toString(),
            (data.avg_messages_per_conversation?.total_conversations || 0).toString(),
            // Custo USD médio por conversa
            (data.avg_cost_usd_per_conversation?.cost || 0).toFixed(6).replace('.', ','),
            (data.avg_cost_usd_per_conversation?.total_cost || 0).toFixed(6).replace('.', ','),
            (data.avg_cost_usd_per_conversation?.total_conversations || 0).toString(),
            // Confidence score médio por conversa
            (data.avg_confidence_per_conversation?.confidence || 0).toFixed(2).replace('.', ','),
            (data.avg_confidence_per_conversation?.total_confidence || 0).toFixed(2).replace('.', ','),
            (data.avg_confidence_per_conversation?.total_conversations || 0).toString(),
            // Contadores
            (data.unique_customers_count || 0).toString(),
            (data.services_count || 0).toString(),
            (data.professionals_count || 0).toString(),
            (data.monthly_platform_cost_brl || 0).toFixed(2).replace('.', ','),
            // Histórico 6 meses formatado
            formatArray(data.six_months_conversations),
            formatArray(data.six_months_revenue),
            formatArray(data.six_months_customers)
        ];
        
        csvContent += row.join(';') + '\n';
    }
    
    const timestamp = new Date().toISOString().slice(0,16).replace(/[:-]/g, '');
    const filename = `tenant-metrics-VALIDADO-${timestamp}.csv`;
    fs.writeFileSync(filename, csvContent, 'utf8');
    
    console.log(`✅ CSV validado gerado: ${filename}`);
    console.log(`📊 Total de registros: ${tenantMetrics.length}`);
    
    // Mostrar amostra dos dados
    console.log('\n📋 AMOSTRA DOS DADOS:');
    tenantMetrics.slice(0, 3).forEach(metric => {
        const data = metric.metric_data || {};
        const tenant = metric.tenants || {};
        console.log(`\n🏢 ${tenant.name} (${metric.period})`);
        console.log(`   • Minutos médios: ${(data.avg_minutes_per_conversation?.minutes || 0).toFixed(2)}`);
        console.log(`   • Clientes únicos: ${data.unique_customers_count || 0}`);
        console.log(`   • Custo USD médio: $${(data.avg_cost_usd_per_conversation?.cost || 0).toFixed(6)}`);
    });
}

generateValidatedCSV().catch(console.error);