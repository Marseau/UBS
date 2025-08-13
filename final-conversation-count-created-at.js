/**
 * CONTAGEM FINAL DE CONVERSAS POR TENANT - USANDO CREATED_AT
 * Context Engineering COLEAM00 - Análise definitiva com campo correto
 */

require('dotenv').config();
const { getAdminClient } = require('./dist/config/database.js');

async function finalConversationCountCreatedAt() {
    console.log('📊 CONTAGEM FINAL - CONVERSAS POR TENANT USANDO CREATED_AT');
    console.log('Context Engineering COLEAM00 - Campo Correto Confirmado');
    console.log('=' .repeat(80));

    try {
        const supabase = getAdminClient();
        
        // ========================================
        // 1. VERIFICAR RANGE DE DATAS DISPONÍVEIS
        // ========================================
        console.log('\n📅 1. VERIFICANDO RANGE DE DATAS DISPONÍVEIS...');
        
        const { data: dateRange, error: rangeError } = await supabase
            .from('conversation_history')
            .select('created_at')
            .order('created_at', { ascending: false })
            .limit(1);

        const { data: oldestDate, error: oldestError } = await supabase
            .from('conversation_history')
            .select('created_at')
            .order('created_at', { ascending: true })
            .limit(1);

        if (rangeError || oldestError) {
            throw new Error('Erro ao buscar range de datas');
        }

        const mostRecent = new Date(dateRange[0].created_at);
        const oldest = new Date(oldestDate[0].created_at);
        
        console.log(`📊 Data mais recente: ${mostRecent.toISOString().split('T')[0]}`);
        console.log(`📊 Data mais antiga: ${oldest.toISOString().split('T')[0]}`);
        console.log(`📊 Range total: ${Math.round((mostRecent - oldest) / (1000*60*60*24))} dias`);

        // Usar a data mais recente como referência
        const referenceDate = mostRecent;
        console.log(`\n💡 Usando como referência: ${referenceDate.toISOString().split('T')[0]}`);
        
        // ========================================
        // 2. BUSCAR TODOS OS TENANTS
        // ========================================
        console.log('\n🏢 2. BUSCANDO TODOS OS TENANTS...');
        
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
        // 3. CONTAR CONVERSAS POR PERÍODO
        // ========================================
        const periods = [
            { name: '7 DIAS', days: 7 },
            { name: '30 DIAS', days: 30 },
            { name: '90 DIAS', days: 90 }
        ];

        console.log('\n📅 3. CONTANDO CONVERSAS POR PERÍODO (USANDO CREATED_AT)...');
        
        const results = {};
        
        for (const period of periods) {
            console.log(`\n⏰ PERÍODO: ${period.name}`);
            console.log('-'.repeat(50));
            
            // Calcular datas do período baseado na data de referência
            const dateEnd = referenceDate.toISOString();
            const dateStart = new Date(referenceDate.getTime() - period.days * 24 * 60 * 60 * 1000).toISOString();
            
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
                
                console.log(`   ${tenantId.substring(0, 8)}...: ${conversationCount} conversas`);
            }
            
            // Ordenar por count
            results[period.name].sort((a, b) => b.count - a.count);
            
            console.log(`\n📈 TOTAL ${period.name}: ${totalConversations} conversas`);
            console.log(`🏢 Tenants com conversas: ${results[period.name].filter(r => r.count > 0).length}/${uniqueTenants.length}`);
        }

        // ========================================
        // 4. TABELA RESUMO
        // ========================================
        console.log('\n' + '='.repeat(80));
        console.log('📊 RESUMO FINAL - CONVERSAS POR TENANT E PERÍODO');
        console.log('='.repeat(80));

        console.log('\n🏆 TABELA COMPLETA:');
        console.log('| TENANT                               | 7 DIAS | 30 DIAS | 90 DIAS |');
        console.log('|--------------------------------------|--------|---------|---------|');

        uniqueTenants.forEach(tenantId => {
            const count7d = results['7 DIAS'].find(r => r.tenant_id === tenantId)?.count || 0;
            const count30d = results['30 DIAS'].find(r => r.tenant_id === tenantId)?.count || 0;
            const count90d = results['90 DIAS'].find(r => r.tenant_id === tenantId)?.count || 0;
            
            console.log(`| ${tenantId} | ${String(count7d).padStart(6)} | ${String(count30d).padStart(7)} | ${String(count90d).padStart(7)} |`);
        });

        // ========================================
        // 5. TOTAIS DA PLATAFORMA
        // ========================================
        console.log('\n📈 TOTAIS DA PLATAFORMA:');
        periods.forEach(period => {
            const total = results[period.name].reduce((sum, r) => sum + r.count, 0);
            const tenantsAtivos = results[period.name].filter(r => r.count > 0).length;
            console.log(`   ${period.name}: ${total} conversas em ${tenantsAtivos} tenants ativos`);
        });

        // ========================================
        // 6. ANÁLISE DETALHADA
        // ========================================
        console.log('\n🔍 ANÁLISE DETALHADA POR TENANT...');
        
        for (const tenantId of uniqueTenants) {
            const count30d = results['30 DIAS'].find(r => r.tenant_id === tenantId)?.count || 0;
            
            if (count30d > 0) {
                console.log(`\n🏪 TENANT: ${tenantId}`);
                console.log(`📊 Total conversas (30 dias): ${count30d}`);
                
                // Buscar detalhes dos dados disponíveis
                const dateEnd = referenceDate.toISOString();
                const dateStart = new Date(referenceDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
                
                const { data: tenantDetails, error: detailsError } = await supabase
                    .from('conversation_history')
                    .select('conversation_outcome, intent_detected, confidence_score, api_cost_usd, tokens_used, created_at')
                    .eq('tenant_id', tenantId)
                    .gte('created_at', dateStart)
                    .lte('created_at', dateEnd);

                if (!detailsError && tenantDetails && tenantDetails.length > 0) {
                    const hasOutcome = tenantDetails.filter(r => r.conversation_outcome !== null).length;
                    const hasIntent = tenantDetails.filter(r => r.intent_detected !== null).length;
                    const hasConfidence = tenantDetails.filter(r => r.confidence_score !== null).length;
                    const hasCost = tenantDetails.filter(r => r.api_cost_usd !== null).length;
                    const hasTokens = tenantDetails.filter(r => r.tokens_used !== null).length;
                    
                    console.log(`   📋 QUALIDADE DOS DADOS:`);
                    console.log(`      ✅ Total válido: ${tenantDetails.length} conversas`);
                    console.log(`      🎯 Com outcome: ${hasOutcome} (${((hasOutcome/tenantDetails.length)*100).toFixed(1)}%)`);
                    console.log(`      🤖 Com intent: ${hasIntent} (${((hasIntent/tenantDetails.length)*100).toFixed(1)}%)`);
                    console.log(`      📊 Com confidence: ${hasConfidence} (${((hasConfidence/tenantDetails.length)*100).toFixed(1)}%)`);
                    console.log(`      💰 Com custo: ${hasCost} (${((hasCost/tenantDetails.length)*100).toFixed(1)}%)`);
                    console.log(`      🔢 Com tokens: ${hasTokens} (${((hasTokens/tenantDetails.length)*100).toFixed(1)}%)`);
                    
                    // Mostrar outcomes se existirem
                    if (hasOutcome > 0) {
                        const outcomeDistribution = {};
                        tenantDetails.forEach(record => {
                            if (record.conversation_outcome) {
                                outcomeDistribution[record.conversation_outcome] = (outcomeDistribution[record.conversation_outcome] || 0) + 1;
                            }
                        });
                        
                        console.log(`   🎯 OUTCOMES ENCONTRADOS:`);
                        Object.entries(outcomeDistribution)
                            .sort(([,a], [,b]) => b - a)
                            .forEach(([outcome, count]) => {
                                const percentage = ((count / hasOutcome) * 100).toFixed(1);
                                console.log(`      📈 ${outcome}: ${count} (${percentage}%)`);
                            });
                    }
                    
                    // Mostrar range de datas deste tenant
                    const dates = tenantDetails.map(r => new Date(r.created_at)).sort((a, b) => a - b);
                    if (dates.length > 0) {
                        console.log(`   📅 RANGE DE DATAS DESTE TENANT:`);
                        console.log(`      Primeira: ${dates[0].toISOString().split('T')[0]}`);
                        console.log(`      Última: ${dates[dates.length-1].toISOString().split('T')[0]}`);
                    }
                }
            }
        }

        console.log('\n✅ ANÁLISE FINAL CONCLUÍDA COM CREATED_AT');
        console.log('🎯 Agora temos os dados corretos e detalhados por tenant!');

    } catch (error) {
        console.error('❌ Erro durante análise:', error.message);
        console.error(error.stack);
    }
}

// Executar análise final
finalConversationCountCreatedAt();