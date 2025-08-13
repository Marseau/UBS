#!/usr/bin/env node
/**
 * Check existing platform_metrics data
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const adminClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

async function checkExistingData() {
    console.log('🔍 Verificando dados existentes em platform_metrics...\n');
    
    try {
        // 1. Verificar todos os registros
        console.log('1. Listando todos os registros existentes...');
        
        const { data: allData, error: allError } = await adminClient
            .from('platform_metrics')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (allError) {
            console.log('❌ Erro ao buscar dados:', allError.message);
            return;
        }
        
        console.log(`✅ Encontrados ${allData.length} registros na tabela platform_metrics`);
        
        if (allData.length === 0) {
            console.log('⚠️ Tabela está vazia - cron jobs podem não estar funcionando corretamente');
            return;
        }
        
        // 2. Agrupar por período
        console.log('\n2. Agrupando registros por período...');
        
        const byPeriod = {};
        allData.forEach(record => {
            const period = `${record.period_days}d`;
            if (!byPeriod[period]) {
                byPeriod[period] = [];
            }
            byPeriod[period].push(record);
        });
        
        Object.entries(byPeriod).forEach(([period, records]) => {
            console.log(`   ${period}: ${records.length} registros`);
            const latest = records[0]; // Já ordenado por created_at desc
            console.log(`     Último: ${latest.calculation_date} - R$${latest.total_revenue || 0} - ${latest.active_tenants || 0} tenants`);
        });
        
        // 3. Mostrar dados detalhados dos registros mais recentes
        console.log('\n3. Dados detalhados dos 3 registros mais recentes...');
        
        const recentRecords = allData.slice(0, 3);
        recentRecords.forEach((record, i) => {
            console.log(`\n   📊 Registro ${i + 1} (${record.period_days}d - ${record.calculation_date}):`);
            console.log(`     ID: ${record.id}`);
            console.log(`     Receita Total: R$ ${record.total_revenue || 0}`);
            console.log(`     Tenants Ativos: ${record.active_tenants || 0}`);
            console.log(`     Total Agendamentos: ${record.total_appointments || 0}`);
            console.log(`     Total Conversas: ${record.total_conversations || 0}`);
            console.log(`     MRR Plataforma: R$ ${record.platform_mrr || 0}`);
            console.log(`     Score Saúde: ${record.platform_health_score || 0}`);
            console.log(`     Fonte dos Dados: ${record.data_source}`);
            console.log(`     Criado em: ${record.created_at}`);
        });
        
        // 4. Verificar se dados são recentes (últimas 24h)
        console.log('\n4. Verificando recência dos dados...');
        
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        const recentData = allData.filter(record => {
            const createdAt = new Date(record.created_at);
            return createdAt > twentyFourHoursAgo;
        });
        
        if (recentData.length > 0) {
            console.log(`✅ Encontrados ${recentData.length} registros das últimas 24h`);
            console.log('   Cron jobs parecem estar funcionando corretamente!');
        } else {
            console.log('⚠️ Nenhum registro das últimas 24h encontrado');
            console.log('   Últimos dados de:', allData[0]?.created_at || 'N/A');
            console.log('   Pode indicar que cron jobs não estão executando automaticamente');
        }
        
        // 5. Validar integridade dos dados
        console.log('\n5. Validando integridade dos dados...');
        
        let issuesFound = 0;
        
        allData.forEach(record => {
            const issues = [];
            
            // Verificar se campos essenciais estão preenchidos
            if (!record.total_revenue && record.total_revenue !== 0) issues.push('total_revenue ausente');
            if (!record.active_tenants && record.active_tenants !== 0) issues.push('active_tenants ausente');
            if (!record.calculation_date) issues.push('calculation_date ausente');
            if (!record.data_source) issues.push('data_source ausente');
            
            // Verificar valores negativos onde não deveriam existir
            if (record.total_revenue < 0) issues.push('total_revenue negativo');
            if (record.active_tenants < 0) issues.push('active_tenants negativo');
            
            if (issues.length > 0) {
                console.log(`   ⚠️ Problemas no registro ${record.id}: ${issues.join(', ')}`);
                issuesFound++;
            }
        });
        
        if (issuesFound === 0) {
            console.log('✅ Todos os registros passaram na validação de integridade');
        } else {
            console.log(`⚠️ Encontrados problemas em ${issuesFound} registros`);
        }
        
        // 6. Resumo final
        console.log('\n📊 RESUMO FINAL:');
        console.log('='.repeat(50));
        console.log(`Total de registros: ${allData.length}`);
        console.log(`Períodos disponíveis: ${Object.keys(byPeriod).join(', ')}`);
        console.log(`Registros recentes (24h): ${recentData.length}`);
        console.log(`Status dos dados: ${issuesFound === 0 ? '✅ Íntegros' : '⚠️ Com problemas'}`);
        console.log(`Status do cron: ${recentData.length > 0 ? '✅ Funcionando' : '⚠️ Pode não estar executando'}`);
        
        return {
            totalRecords: allData.length,
            periodsAvailable: Object.keys(byPeriod),
            recentRecords: recentData.length,
            dataIntegrity: issuesFound === 0,
            cronWorking: recentData.length > 0,
            status: (allData.length > 0 && issuesFound === 0) ? 'HEALTHY' : 'NEEDS_ATTENTION'
        };
        
    } catch (error) {
        console.error('💥 Erro geral:', error.message);
        throw error;
    }
}

checkExistingData()
    .then(result => {
        console.log('\n🎯 RESULTADO JSON:');
        console.log(JSON.stringify(result, null, 2));
    })
    .catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });