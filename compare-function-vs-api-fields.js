/**
 * Compara campos que a função popula vs campos que a API precisa
 */

console.log('🔍 ANÁLISE: Função vs API - Campos Necessários\n');

// Campos que a função POPULA na tabela ubs_metric_system
const fieldsPopulatedByFunction = [
    'platform_total_revenue',
    'platform_total_appointments', 
    'platform_total_customers',
    'platform_total_ai_interactions',
    'platform_active_tenants',
    'platform_mrr',
    'platform_total_chat_minutes',
    'platform_receita_uso_ratio',
    'platform_operational_efficiency_pct',
    'platform_spam_rate_pct',
    'platform_revenue_usage_distortion_index'
];

// Campos que a API BUSCA da tabela
const fieldsNeededByAPI = [
    'platform_mrr',                           // ✅ KPI 2
    'platform_active_tenants',                // ✅ KPI 3  
    'platform_total_revenue',                 // ✅ (usado indiretamente)
    'platform_total_appointments',            // ✅ KPI 7
    'platform_total_customers',               // ✅ (usado indiretamente)
    'platform_total_ai_interactions',         // ✅ KPI 8
    'platform_total_chat_minutes',            // ✅ (usado para cálculos)
    'platform_receita_uso_ratio',             // ✅ KPI 1
    'platform_operational_efficiency_pct',    // ✅ KPI 4
    'platform_spam_rate_pct',                 // ✅ KPI 5
    'platform_revenue_usage_distortion_index' // ✅ (usado indiretamente)
];

// KPIs que a API precisa calcular
const kpisNeededByDashboard = [
    {
        name: 'KPI 1: Receita/Uso Ratio',
        source: 'platform_receita_uso_ratio',
        status: '✅ DISPONÍVEL'
    },
    {
        name: 'KPI 2: MRR da Plataforma',
        source: 'platform_mrr',
        status: '✅ DISPONÍVEL'
    },
    {
        name: 'KPI 3: Tenants Ativos',
        source: 'platform_active_tenants',
        status: '✅ DISPONÍVEL'
    },
    {
        name: 'KPI 4: Eficiência Operacional',
        source: 'platform_operational_efficiency_pct',
        status: '✅ DISPONÍVEL'
    },
    {
        name: 'KPI 5: Spam Rate',
        source: 'platform_spam_rate_pct',
        status: '✅ DISPONÍVEL'
    },
    {
        name: 'KPI 6: Taxa de Cancelamentos + Remarcações',
        source: 'CALCULADO SEPARADAMENTE',
        status: '❌ FALTANDO - não populado pela função'
    },
    {
        name: 'KPI 7: Total de Agendamentos',
        source: 'platform_total_appointments',
        status: '✅ DISPONÍVEL'
    },
    {
        name: 'KPI 8: Interações com IA',
        source: 'platform_total_ai_interactions',
        status: '✅ DISPONÍVEL'
    }
];

console.log('📊 CAMPOS POPULADOS PELA FUNÇÃO:');
fieldsPopulatedByFunction.forEach((field, index) => {
    console.log(`   ${index + 1}. ${field}`);
});

console.log('\n📊 CAMPOS NECESSÁRIOS PELA API:');
fieldsNeededByAPI.forEach((field, index) => {
    const isAvailable = fieldsPopulatedByFunction.includes(field);
    const status = isAvailable ? '✅' : '❌';
    console.log(`   ${index + 1}. ${field} ${status}`);
});

console.log('\n📊 STATUS DOS KPIs DO DASHBOARD:');
kpisNeededByDashboard.forEach((kpi, index) => {
    console.log(`   ${index + 1}. ${kpi.name}`);
    console.log(`      Fonte: ${kpi.source}`);
    console.log(`      Status: ${kpi.status}`);
    console.log('');
});

console.log('🔍 CAMPOS FALTANDO:');
const missingFields = fieldsNeededByAPI.filter(field => !fieldsPopulatedByFunction.includes(field));
if (missingFields.length === 0) {
    console.log('   ✅ Todos os campos necessários estão sendo populados!');
} else {
    missingFields.forEach((field, index) => {
        console.log(`   ${index + 1}. ${field} ❌`);
    });
}

console.log('\n📊 CAMPOS EXTRAS (populados mas não usados):');
const extraFields = fieldsPopulatedByFunction.filter(field => !fieldsNeededByAPI.includes(field));
if (extraFields.length === 0) {
    console.log('   📋 Nenhum campo extra');
} else {
    extraFields.forEach((field, index) => {
        console.log(`   ${index + 1}. ${field} (não usado pela API)`);
    });
}

console.log('\n💡 PROBLEMAS IDENTIFICADOS:');

console.log('\n1. ❌ KPI 6 (Taxa de Cancelamentos + Remarcações):');
console.log('   - A função NÃO calcula este KPI');
console.log('   - A API está definindo valor fixo = 0');
console.log('   - SOLUÇÃO: Adicionar cálculo na função ou na API');

console.log('\n2. ⚠️  Data Source Mismatch:');
console.log('   - Função popula com data_source = "enhanced_platform_function"');
console.log('   - Mas dados existentes têm data_source = "final_fixed_function"');
console.log('   - API já foi corrigida para aceitar ambos');

console.log('\n3. ⚠️  Tenant ID Filter:');
console.log('   - Função cria registro com tenant_id = NULL (registro da plataforma)');
console.log('   - API busca com tenant_id IS NOT NULL (registros dos tenants)');
console.log('   - CONFLITO: API está buscando registros errados!');

console.log('\n🎯 SOLUÇÃO PRINCIPAL:');
console.log('   A API deve buscar o registro da PLATAFORMA (tenant_id IS NULL)');
console.log('   Em vez de buscar registros dos tenants (tenant_id IS NOT NULL)');

console.log('\n📋 CAMPOS NECESSÁRIOS PARA CÁLCULO DE KPI 6:');
console.log('   Para calcular Taxa de Cancelamentos + Remarcações, precisamos:');
console.log('   - tenant_appointments_cancelled (por tenant)');
console.log('   - tenant_appointments_rescheduled (por tenant)');
console.log('   - tenant_total_conversations (por tenant)');
console.log('   - Estes campos JÁ EXISTEM na tabela ubs_metric_system!');

console.log('\n✅ CONCLUSÃO:');
console.log('   1. Função popula QUASE todos os campos necessários');
console.log('   2. PROBLEMA PRINCIPAL: API busca registros errados (tenants em vez de plataforma)');
console.log('   3. KPI 6 pode ser calculado a partir dos dados existentes');
console.log('   4. Dados estão lá, apenas a query da API precisa ser corrigida!');