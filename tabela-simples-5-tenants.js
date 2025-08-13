/**
 * Tabela Comparativa Simples - 5 Tenants com Dados (90 dias)
 * Métricas principais: metric_data vs metricas_validadas vs dados brutos
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 5 tenants com dados identificados
const TENANTS_COM_DADOS = [
    { id: '33b8c488-5aa9-4891-b335-701d10296681', name: 'Bella Vista Spa & Salon' },
    { id: 'fe2fa876-05da-49b5-b266-8141bcd090fa', name: 'Clínica Mente Sã' },
    { id: '5bd592ee-8247-4a62-862e-7491fa499103', name: 'Charme Total BH' },
    { id: 'f34d8c94-f6cf-4dd7-82de-a3123b380cd8', name: 'Centro Terapêutico Equilíbrio' },
    { id: 'fe1fbd26-16cf-4106-9be0-390bf8345304', name: 'Studio Glamour Rio' }
];

// Definir as principais métricas e seus significados
const METRICAS_PRINCIPAIS = {
    monthly_revenue: 'Receita mensal total dos appointments pagos',
    new_customers: 'Número de novos clientes no período',
    total_appointments: 'Total de agendamentos realizados',
    appointment_success_rate: 'Taxa de sucesso dos agendamentos (%)',
    avg_revenue_per_appointment: 'Ticket médio por appointment',
    total_conversations: 'Volume total de conversas no WhatsApp',
    conversion_rate: 'Taxa de conversão conversa → agendamento',
    cancellation_rate: 'Taxa de cancelamentos (%)'
};

async function extrairDadosBrutos(tenantId) {
    console.log(`📊 Calculando dados brutos para tenant ${tenantId.substring(0, 8)}...`);
    
    const periodo90d = new Date();
    periodo90d.setDate(periodo90d.getDate() - 90);
    
    // 1. Revenue - appointments completed/confirmed
    const { data: appointments } = await supabase
        .from('appointments')
        .select('final_price, quoted_price, status, user_id')
        .eq('tenant_id', tenantId)
        .gte('created_at', periodo90d.toISOString());
    
    const appointmentsCompletos = appointments?.filter(a => 
        ['completed', 'confirmed'].includes(a.status)
    ) || [];
    
    const revenue = appointmentsCompletos.reduce((sum, apt) => {
        const price = apt.final_price || apt.quoted_price || 0;
        return sum + parseFloat(price);
    }, 0);
    
    // 2. New customers - user_tenants com first_interaction no período
    const { data: newCustomers } = await supabase
        .from('user_tenants')
        .select('user_id')
        .eq('tenant_id', tenantId)
        .gte('first_interaction', periodo90d.toISOString());
    
    // 3. Conversations
    const { data: conversations } = await supabase
        .from('conversation_history')
        .select('conversation_outcome, user_id')
        .eq('tenant_id', tenantId)
        .gte('created_at', periodo90d.toISOString());
    
    const totalConversations = conversations?.length || 0;
    
    // 4. Success rate - outcomes que resultaram em agendamento
    const successOutcomes = ['appointment_created', 'appointment_confirmed'];
    const successConversations = conversations?.filter(c => 
        successOutcomes.includes(c.conversation_outcome)
    ).length || 0;
    
    // 5. Cancelamentos
    const cancelOutcomes = ['appointment_cancelled'];
    const cancelConversations = conversations?.filter(c => 
        cancelOutcomes.includes(c.conversation_outcome)
    ).length || 0;
    
    return {
        monthly_revenue: revenue,
        new_customers: new Set(newCustomers?.map(nc => nc.user_id) || []).size,
        total_appointments: appointments?.length || 0,
        appointment_success_rate: totalConversations > 0 ? (successConversations / totalConversations) * 100 : 0,
        avg_revenue_per_appointment: appointmentsCompletos.length > 0 ? revenue / appointmentsCompletos.length : 0,
        total_conversations: totalConversations,
        conversion_rate: totalConversations > 0 ? (successConversations / totalConversations) * 100 : 0,
        cancellation_rate: totalConversations > 0 ? (cancelConversations / totalConversations) * 100 : 0
    };
}

async function obterMetricasCalculadas(tenantId) {
    console.log(`🔍 Buscando métricas calculadas para ${tenantId.substring(0, 8)}...`);
    
    // Buscar tenant_metrics para período 90d
    const { data: tenantMetrics } = await supabase
        .from('tenant_metrics')
        .select('metric_data, metricas_validadas')
        .eq('tenant_id', tenantId)
        .eq('period', '90d')
        .order('calculated_at', { ascending: false })
        .limit(1);
    
    const metricData = tenantMetrics?.[0]?.metric_data || {};
    const metricasValidadas = tenantMetrics?.[0]?.metricas_validadas || {};
    
    return {
        metric_data: {
            monthly_revenue: metricData.monthly_revenue || 0,
            new_customers: metricData.new_customers || 0,
            total_appointments: metricData.total_appointments || 0,
            appointment_success_rate: metricData.appointment_success_rate || 0,
            avg_revenue_per_appointment: metricData.avg_revenue_per_appointment || 0,
            total_conversations: metricData.total_conversations || 0,
            conversion_rate: metricData.conversion_rate || 0,
            cancellation_rate: metricData.cancellation_rate || 0
        },
        metricas_validadas: {
            monthly_revenue: metricasValidadas.monthly_revenue || 0,
            new_customers: metricasValidadas.new_customers || 0,
            total_appointments: metricasValidadas.no_show_impact?.total_appointments || 0,
            appointment_success_rate: metricasValidadas.appointment_success_rate || 0,
            avg_revenue_per_appointment: 0, // Calcular se disponível
            total_conversations: metricasValidadas.total_conversations || 0,
            conversion_rate: 0, // Derivar de outras métricas
            cancellation_rate: metricasValidadas.cancellation_rate?.percentage || 0
        }
    };
}

function formatarValor(metrica, valor) {
    if (typeof valor !== 'number') return 'N/A';
    
    if (metrica.includes('revenue') || metrica.includes('avg_')) {
        return new Intl.NumberFormat('pt-BR', { 
            style: 'currency', 
            currency: 'BRL' 
        }).format(valor);
    }
    
    if (metrica.includes('rate') || metrica.includes('conversion')) {
        return `${valor.toFixed(2)}%`;
    }
    
    return valor.toLocaleString('pt-BR');
}

async function gerarTabelaComparativa() {
    console.log('🎯 TABELA COMPARATIVA SIMPLES - 5 TENANTS (90 DIAS)\n');
    
    const resultados = [];
    
    for (const tenant of TENANTS_COM_DADOS) {
        console.log(`\n🏢 Processando: ${tenant.name}`);
        
        const dadosBrutos = await extrairDadosBrutos(tenant.id);
        const metricasCalculadas = await obterMetricasCalculadas(tenant.id);
        
        resultados.push({
            tenant: tenant.name,
            id: tenant.id,
            brutos: dadosBrutos,
            calculados: metricasCalculadas
        });
    }
    
    // Gerar tabela HTML
    let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Comparativa de Métricas - 5 Tenants (90d)</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        .metrica { background-color: #e8f4fd; font-weight: bold; }
        .significado { background-color: #f9f9f9; font-style: italic; }
        .bruto { background-color: #e8f5e8; }
        .sistema-principal { background-color: #fff2cc; }
        .sistema-validado { background-color: #fce4ec; }
        .divergente { background-color: #ffebee; color: #d32f2f; }
        .match { background-color: #e8f5e8; color: #2e7d32; }
    </style>
</head>
<body>
    <h1>📊 Comparativa de Métricas UBS - 5 Tenants (90 dias)</h1>
    <p><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
    
    <table>
        <thead>
            <tr>
                <th>Métrica</th>
                <th>O que Mede</th>
                <th>Bella Vista<br/>Spa & Salon</th>
                <th>Clínica<br/>Mente Sã</th>
                <th>Charme<br/>Total BH</th>
                <th>Centro Terapêutico<br/>Equilíbrio</th>
                <th>Studio<br/>Glamour Rio</th>
            </tr>
        </thead>
        <tbody>
`;

    // Para cada métrica, criar 3 linhas: Bruto, Sistema Principal, Sistema Validado
    for (const [metrica, significado] of Object.entries(METRICAS_PRINCIPAIS)) {
        // Linha da métrica e significado
        html += `
            <tr>
                <td class="metrica" rowspan="3">${metrica.replace('_', ' ').toUpperCase()}</td>
                <td class="significado" rowspan="3">${significado}</td>`;
        
        // Dados brutos para todos os tenants
        resultados.forEach(resultado => {
            const valor = resultado.brutos[metrica];
            html += `<td class="bruto">💎 <strong>${formatarValor(metrica, valor)}</strong></td>`;
        });
        html += `</tr>`;
        
        // Sistema principal
        html += `<tr>`;
        resultados.forEach(resultado => {
            const valor = resultado.calculados.metric_data[metrica];
            html += `<td class="sistema-principal">🔧 ${formatarValor(metrica, valor)}</td>`;
        });
        html += `</tr>`;
        
        // Sistema validado
        html += `<tr>`;
        resultados.forEach(resultado => {
            const valor = resultado.calculados.metricas_validadas[metrica];
            html += `<td class="sistema-validado">✅ ${formatarValor(metrica, valor)}</td>`;
        });
        html += `</tr>`;
    }
    
    html += `
        </tbody>
    </table>
    
    <h2>📋 Legenda</h2>
    <ul>
        <li><span style="background-color: #e8f5e8; padding: 2px 6px;">💎 Dados Brutos</span> - Valores extraídos diretamente do banco de dados</li>
        <li><span style="background-color: #fff2cc; padding: 2px 6px;">🔧 Sistema Principal</span> - Valores do campo metric_data</li>
        <li><span style="background-color: #fce4ec; padding: 2px 6px;">✅ Sistema Validado</span> - Valores do campo metricas_validadas</li>
    </ul>
    
    <h2>📊 Resumo Executivo</h2>
    <p>Esta tabela compara os valores das principais métricas de negócio calculados pelos dois sistemas do UBS versus os dados extraídos diretamente das tabelas do banco de dados para o período de 90 dias.</p>
    
</body>
</html>`;

    const fileName = `TABELA-COMPARATIVA-5-TENANTS-90D-${Date.now()}.html`;
    require('fs').writeFileSync(fileName, html);
    
    console.log(`\n✅ TABELA GERADA: ${fileName}`);
    console.log(`📊 Processados: ${resultados.length} tenants`);
    console.log(`🎯 Métricas analisadas: ${Object.keys(METRICAS_PRINCIPAIS).length}`);
    
    return fileName;
}

if (require.main === module) {
    gerarTabelaComparativa()
        .then(fileName => {
            console.log(`\n🎉 CONCLUÍDO! Abra o arquivo: ${fileName}`);
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Erro:', error);
            process.exit(1);
        });
}

module.exports = { gerarTabelaComparativa };