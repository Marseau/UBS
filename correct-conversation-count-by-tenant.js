/**
 * CONTAGEM CORRETA DE CONVERSAS POR TENANT E PERÍODO
 * Context Engineering COLEAM00 - Baseado nas datas reais dos dados
 */

require('dotenv').config();
const { getAdminClient } = require('./dist/config/database.js');

async function correctConversationCountByTenant() {
    console.log('📊 CONTAGEM CORRETA DE CONVERSAS POR TENANT E PERÍODO');
    console.log('Context Engineering COLEAM00 - Baseado nas Datas Reais');
    console.log('=' .repeat(80));

    try {
        const supabase = getAdminClient();
        
        // Usar 30 de julho como data de referência (último dado disponível)
        const referenceDate = new Date('2025-07-30T23:59:59Z');
        console.log(`📅 Data de referência: ${referenceDate.toISOString().split('T')[0]}`);
        console.log('💡 (Usando data dos dados reais, não data atual)');
        
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

        const uniqueTenants = [...new Set(allTenants.map(t => t.tenant_id))];
        console.log(`📋 Total de tenants únicos: ${uniqueTenants.length}`);
        uniqueTenants.forEach((tenantId, index) => {
            console.log(`   ${index + 1}. ${tenantId}`);
        });
        
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
            
            const dateStart = new Date(referenceDate.getTime() - period.days * 24 * 60 * 60 * 1000).toISOString();
            const dateEnd = referenceDate.toISOString();
            
            console.log(`📊 De: ${dateStart.split('T')[0]} até: ${dateEnd.split('T')[0]}`);
            
            results[period.name] = [];
            let totalConversations = 0;
            
            for (const tenantId of uniqueTenants) {
                const { count, error: countError } = await supabase
                    .from('conversation_history')
                    .select('*', { count: 'exact', head: true })
                    .eq('tenant_id', tenantId)
                    .gte('created_at', dateStart)
                    .lte('created_at', dateEnd);

                if (countError) {
                    console.log(`❌ Erro para tenant ${tenantId.substring(0, 8)}...: ${countError.message}`);
                    continue;
                }

                const conversationCount = count || 0;
                totalConversations += conversationCount;
                
                results[period.name].push({
                    tenant_id: tenantId,
                    count: conversationCount
                });
                
                if (conversationCount > 0) {
                    console.log(`   ${tenantId.substring(0, 8)}...: ${conversationCount} conversas`);
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

        console.log('\n🏆 CONVERSAS POR TENANT E PERÍODO:');
        console.log('| TENANT           | 7 DIAS | 30 DIAS | 90 DIAS |');
        console.log('|------------------|--------|---------|---------|');

        uniqueTenants.forEach(tenantId => {
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
        // 5. ANÁLISE DETALHADA DOS PRINCIPAIS
        // ========================================
        console.log('\n🔍 ANÁLISE DETALHADA DOS PRINCIPAIS TENANTS...');
        
        // Para cada tenant com conversas, mostrar detalhes
        for (const tenantId of uniqueTenants) {
            const count30d = results['30 DIAS'].find(r => r.tenant_id === tenantId)?.count || 0;
            
            if (count30d > 0) {
                console.log(`\n🏪 TENANT: ${tenantId}`);
                console.log(`📊 Conversas em 30 dias: ${count30d}`);
                
                // Buscar detalhes deste tenant (30 dias)
                const dateStart30 = new Date(referenceDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
                const dateEnd = referenceDate.toISOString();
                
                const { data: tenantDetails, error: detailsError } = await supabase
                    .from('conversation_history')
                    .select('conversation_outcome, intent_detected, confidence_score, api_cost_usd, tokens_used')
                    .eq('tenant_id', tenantId)
                    .gte('created_at', dateStart30)
                    .lte('created_at', dateEnd);

                if (!detailsError && tenantDetails) {
                    const hasOutcome = tenantDetails.filter(r => r.conversation_outcome).length;
                    const hasIntent = tenantDetails.filter(r => r.intent_detected).length;
                    const hasConfidence = tenantDetails.filter(r => r.confidence_score !== null).length;
                    const hasCost = tenantDetails.filter(r => r.api_cost_usd !== null).length;
                    const hasTokens = tenantDetails.filter(r => r.tokens_used !== null).length;
                    
                    console.log(`   📋 DADOS DISPONÍVEIS:`);
                    console.log(`      Com outcome: ${hasOutcome}/${tenantDetails.length} (${((hasOutcome/tenantDetails.length)*100).toFixed(1)}%)`);
                    console.log(`      Com intent: ${hasIntent}/${tenantDetails.length} (${((hasIntent/tenantDetails.length)*100).toFixed(1)}%)`);
                    console.log(`      Com confidence: ${hasConfidence}/${tenantDetails.length} (${((hasConfidence/tenantDetails.length)*100).toFixed(1)}%)`);
                    console.log(`      Com custo API: ${hasCost}/${tenantDetails.length} (${((hasCost/tenantDetails.length)*100).toFixed(1)}%)`);
                    console.log(`      Com tokens: ${hasTokens}/${tenantDetails.length} (${((hasTokens/tenantDetails.length)*100).toFixed(1)}%)`);
                    
                    // Mostrar outcomes se disponíveis
                    if (hasOutcome > 0) {
                        const outcomeDistribution = {};
                        tenantDetails.forEach(record => {
                            if (record.conversation_outcome) {
                                outcomeDistribution[record.conversation_outcome] = (outcomeDistribution[record.conversation_outcome] || 0) + 1;
                            }
                        });
                        
                        console.log(`   🎯 OUTCOMES (${hasOutcome} registros):`);
                        Object.entries(outcomeDistribution)
                            .sort(([,a], [,b]) => b - a)
                            .forEach(([outcome, count]) => {
                                const percentage = ((count / hasOutcome) * 100).toFixed(1);
                                console.log(`      ${outcome}: ${count} (${percentage}%)`);
                            });
                    }
                }
            }
        }

        console.log('\n✅ ANÁLISE CORRETA CONCLUÍDA');
        console.log('🔍 Agora temos os dados reais de conversas por tenant e período!');

    } catch (error) {
        console.error('❌ Erro durante análise:', error.message);
        console.error(error.stack);
    }
}

// Executar análise
correctConversationCountByTenant();