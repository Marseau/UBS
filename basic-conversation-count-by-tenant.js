/**
 * CONTAGEM BÁSICA DE CONVERSAS POR TENANT E PERÍODO
 * Context Engineering COLEAM00 - Análise fundamental
 */

require('dotenv').config();
const { getAdminClient } = require('./dist/config/database.js');

async function basicConversationCountByTenant() {
    console.log('📊 CONTAGEM BÁSICA DE CONVERSAS POR TENANT E PERÍODO');
    console.log('Context Engineering COLEAM00 - Análise Fundamental');
    console.log('=' .repeat(80));

    try {
        const supabase = getAdminClient();
        
        // ========================================
        // 1. BUSCAR TODOS OS TENANTS
        // ========================================
        console.log('\n🏢 1. BUSCANDO TODOS OS TENANTS...');
        
        const { data: allTenants, error: tenantsError } = await supabase
            .from('conversation_history')
            .select('tenant_id')
            .not('tenant_id', 'is', null);

        if (tenantsError) {
            throw new Error(`Erro ao buscar tenants: ${tenantsError.message}`);
        }

        // Contar tenants únicos
        const uniqueTenants = [...new Set(allTenants.map(t => t.tenant_id))];
        console.log(`📋 Total de tenants únicos: ${uniqueTenants.length}`);
        
        // ========================================
        // 2. CONTAR CONVERSAS POR PERÍODO
        // ========================================
        const periods = [
            { name: '7 DIAS', days: 7 },
            { name: '30 DIAS', days: 30 },
            { name: '90 DIAS', days: 90 }
        ];

        console.log('\n📅 2. CONTANDO CONVERSAS POR TENANT E PERÍODO...');
        
        const results = {};
        
        for (const period of periods) {
            console.log(`\n⏰ PERÍODO: ${period.name}`);
            console.log('-'.repeat(50));
            
            const dateStart = new Date(Date.now() - period.days * 24 * 60 * 60 * 1000).toISOString();
            const dateEnd = new Date().toISOString();
            
            console.log(`📊 De: ${dateStart.split('T')[0]} até: ${dateEnd.split('T')[0]}`);
            
            results[period.name] = [];
            let totalConversations = 0;
            
            for (const tenantId of uniqueTenants) {
                const { data: conversationCount, error: countError } = await supabase
                    .from('conversation_history')
                    .select('id', { count: 'exact', head: true })
                    .eq('tenant_id', tenantId)
                    .gte('created_at', dateStart)
                    .lte('created_at', dateEnd);

                if (countError) {
                    console.log(`❌ Erro para tenant ${tenantId.substring(0, 8)}...: ${countError.message}`);
                    continue;
                }

                const count = conversationCount || 0;
                totalConversations += count;
                
                results[period.name].push({
                    tenant_id: tenantId,
                    count: count
                });
                
                if (count > 0) {
                    console.log(`   ${tenantId.substring(0, 8)}...: ${count} conversas`);
                }
            }
            
            // Ordenar por count
            results[period.name].sort((a, b) => b.count - a.count);
            
            console.log(`\n📈 TOTAL ${period.name}: ${totalConversations} conversas`);
            console.log(`🏢 Tenants com conversas: ${results[period.name].filter(r => r.count > 0).length}/${uniqueTenants.length}`);
        }

        // ========================================
        // 3. RESUMO COMPARATIVO
        // ========================================
        console.log('\n' + '='.repeat(80));
        console.log('📊 RESUMO COMPARATIVO POR TENANT');
        console.log('='.repeat(80));

        // Buscar tenants com mais conversas
        const topTenants = new Set();
        periods.forEach(period => {
            results[period.name]
                .filter(r => r.count > 0)
                .slice(0, 3)
                .forEach(r => topTenants.add(r.tenant_id));
        });

        console.log('\n🏆 TOP TENANTS POR PERÍODO:');
        console.log('| TENANT           | 7 DIAS | 30 DIAS | 90 DIAS |');
        console.log('|------------------|--------|---------|---------|');

        Array.from(topTenants).forEach(tenantId => {
            const shortId = tenantId.substring(0, 16);
            const count7d = results['7 DIAS'].find(r => r.tenant_id === tenantId)?.count || 0;
            const count30d = results['30 DIAS'].find(r => r.tenant_id === tenantId)?.count || 0;
            const count90d = results['90 DIAS'].find(r => r.tenant_id === tenantId)?.count || 0;
            
            console.log(`| ${shortId} | ${String(count7d).padStart(6)} | ${String(count30d).padStart(7)} | ${String(count90d).padStart(7)} |`);
        });

        // ========================================
        // 4. TOTAIS DA PLATAFORMA
        // ========================================
        console.log('\n📈 TOTAIS DA PLATAFORMA:');
        periods.forEach(period => {
            const total = results[period.name].reduce((sum, r) => sum + r.count, 0);
            const tenantsAtivos = results[period.name].filter(r => r.count > 0).length;
            console.log(`   ${period.name}: ${total} conversas em ${tenantsAtivos} tenants`);
        });

        // ========================================
        // 5. ANÁLISE DE DADOS DETALHADOS
        // ========================================
        console.log('\n🔍 DETALHANDO TENANT PRINCIPAL...');
        
        // Pegar tenant com mais conversas em 30 dias
        const mainTenant = results['30 DIAS'].find(r => r.count > 0);
        
        if (mainTenant) {
            console.log(`🏪 Analisando: ${mainTenant.tenant_id}`);
            console.log(`📊 Conversas em 30 dias: ${mainTenant.count}`);
            
            // Buscar detalhes deste tenant
            const dateStart30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const dateEnd = new Date().toISOString();
            
            const { data: tenantDetails, error: detailsError } = await supabase
                .from('conversation_history')
                .select('conversation_outcome, intent_detected, confidence_score, api_cost_usd')
                .eq('tenant_id', mainTenant.tenant_id)
                .gte('created_at', dateStart30)
                .lte('created_at', dateEnd);

            if (!detailsError && tenantDetails) {
                const hasOutcome = tenantDetails.filter(r => r.conversation_outcome).length;
                const hasIntent = tenantDetails.filter(r => r.intent_detected).length;
                const hasConfidence = tenantDetails.filter(r => r.confidence_score !== null).length;
                const hasCost = tenantDetails.filter(r => r.api_cost_usd !== null).length;
                
                console.log(`\n📋 DETALHES DOS DADOS (30 dias):`);
                console.log(`   Com outcome: ${hasOutcome}/${tenantDetails.length} (${((hasOutcome/tenantDetails.length)*100).toFixed(1)}%)`);
                console.log(`   Com intent: ${hasIntent}/${tenantDetails.length} (${((hasIntent/tenantDetails.length)*100).toFixed(1)}%)`);
                console.log(`   Com confidence: ${hasConfidence}/${tenantDetails.length} (${((hasConfidence/tenantDetails.length)*100).toFixed(1)}%)`);
                console.log(`   Com custo: ${hasCost}/${tenantDetails.length} (${((hasCost/tenantDetails.length)*100).toFixed(1)}%)`);
                
                console.log(`\n🎯 ESTAS SÃO AS ${hasOutcome} CONVERSAS COM OUTCOME que você perguntou!`);
            }
        }

        console.log('\n✅ ANÁLISE BÁSICA CONCLUÍDA');
        console.log('🔍 Agora sabemos exatamente quantas conversas temos por tenant e período');

    } catch (error) {
        console.error('❌ Erro durante análise:', error.message);
        console.error(error.stack);
    }
}

// Executar análise
basicConversationCountByTenant();