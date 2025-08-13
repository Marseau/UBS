/**
 * VERIFICAÇÃO REAL DOS DADOS DE CONVERSATION_HISTORY
 * Context Engineering COLEAM00 - Dados reais sem suposições
 */

require('dotenv').config();
const { getAdminClient } = require('./dist/config/database.js');

async function checkRealConversationData() {
    console.log('🔍 VERIFICAÇÃO REAL DOS DADOS DE CONVERSATION_HISTORY');
    console.log('Context Engineering COLEAM00 - Sem Suposições');
    console.log('=' .repeat(80));

    try {
        const supabase = getAdminClient();
        const tenantId = '33b8c488-5aa9-4891-b335-701d10296681';
        
        console.log(`🏪 Verificando tenant: ${tenantId}`);
        
        // ========================================
        // 1. VERIFICAR SE TENANT EXISTE
        // ========================================
        console.log('\n📊 1. VERIFICANDO EXISTÊNCIA DO TENANT...');
        
        const { data: tenantData, error: tenantError } = await supabase
            .from('conversation_history')
            .select('created_at')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(5);

        if (tenantError) {
            throw new Error(`Erro tenant: ${tenantError.message}`);
        }

        if (!tenantData || tenantData.length === 0) {
            console.log('❌ TENANT NÃO ENCONTRADO na conversation_history');
            
            // Buscar outros tenants disponíveis
            const { data: otherTenants } = await supabase
                .from('conversation_history')
                .select('tenant_id')
                .limit(10);
            
            if (otherTenants && otherTenants.length > 0) {
                const uniqueTenants = [...new Set(otherTenants.map(t => t.tenant_id))];
                console.log('\n📋 TENANTS DISPONÍVEIS:');
                uniqueTenants.slice(0, 5).forEach((tid, index) => {
                    console.log(`   ${index + 1}. ${tid}`);
                });
            }
            return;
        }

        console.log(`✅ Tenant encontrado`);
        console.log(`📅 Datas mais recentes:`);
        tenantData.forEach((record, index) => {
            console.log(`   ${index + 1}. ${record.created_at}`);
        });

        // ========================================
        // 2. DADOS DOS ÚLTIMOS 30 DIAS
        // ========================================
        console.log('\n📅 2. VERIFICANDO ÚLTIMOS 30 DIAS...');
        
        const dateStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const dateEnd = new Date().toISOString();
        
        console.log(`📊 Período: ${dateStart.split('T')[0]} até ${dateEnd.split('T')[0]}`);

        const { data: recentData, error: recentError } = await supabase
            .from('conversation_history')
            .select('id, conversation_outcome, intent_detected, confidence_score, api_cost_usd, tokens_used, created_at')
            .eq('tenant_id', tenantId)
            .gte('created_at', dateStart)
            .lte('created_at', dateEnd)
            .order('created_at', { ascending: false });

        if (recentError) {
            throw new Error(`Erro recent: ${recentError.message}`);
        }

        console.log(`📊 Registros encontrados: ${recentData?.length || 0}`);

        if (!recentData || recentData.length === 0) {
            console.log('⚠️  NENHUM REGISTRO NOS ÚLTIMOS 30 DIAS');
            
            // Tentar 90 dias
            console.log('\n📅 Tentando últimos 90 dias...');
            const dateStart90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
            
            const { data: data90, error: error90 } = await supabase
                .from('conversation_history')
                .select('id, conversation_outcome, intent_detected, confidence_score, api_cost_usd, tokens_used, created_at')
                .eq('tenant_id', tenantId)
                .gte('created_at', dateStart90)
                .lte('created_at', dateEnd)
                .order('created_at', { ascending: false });

            if (error90) {
                throw new Error(`Erro 90d: ${error90.message}`);
            }

            console.log(`📊 Registros em 90 dias: ${data90?.length || 0}`);
            
            if (data90 && data90.length > 0) {
                recentData.push(...data90);
                console.log('✅ Usando dados de 90 dias');
            } else {
                console.log('❌ NENHUM DADO ENCONTRADO EM 90 DIAS');
                return;
            }
        }

        // ========================================
        // 3. ANÁLISE DOS DADOS REAIS
        // ========================================
        console.log('\n📊 3. ANÁLISE DOS DADOS REAIS...');
        
        const totalRecords = recentData.length;
        const hasOutcome = recentData.filter(r => r.conversation_outcome !== null && r.conversation_outcome !== undefined).length;
        const hasIntent = recentData.filter(r => r.intent_detected !== null && r.intent_detected !== undefined).length;
        const hasConfidence = recentData.filter(r => r.confidence_score !== null && r.confidence_score !== undefined).length;
        const hasCost = recentData.filter(r => r.api_cost_usd !== null && r.api_cost_usd !== undefined).length;
        const hasTokens = recentData.filter(r => r.tokens_used !== null && r.tokens_used !== undefined).length;

        console.log(`📋 ESTATÍSTICAS REAIS:`);
        console.log(`   Total registros: ${totalRecords}`);
        console.log(`   Com outcome: ${hasOutcome}/${totalRecords} (${((hasOutcome/totalRecords)*100).toFixed(1)}%)`);
        console.log(`   Com intent: ${hasIntent}/${totalRecords} (${((hasIntent/totalRecords)*100).toFixed(1)}%)`);
        console.log(`   Com confidence: ${hasConfidence}/${totalRecords} (${((hasConfidence/totalRecords)*100).toFixed(1)}%)`);
        console.log(`   Com custo API: ${hasCost}/${totalRecords} (${((hasCost/totalRecords)*100).toFixed(1)}%)`);
        console.log(`   Com tokens: ${hasTokens}/${totalRecords} (${((hasTokens/totalRecords)*100).toFixed(1)}%)`);

        // ========================================
        // 4. AMOSTRAS DOS DADOS REAIS
        // ========================================
        console.log('\n📋 4. AMOSTRA DOS DADOS REAIS:');
        
        console.log('\n📄 PRIMEIROS 3 REGISTROS:');
        recentData.slice(0, 3).forEach((record, index) => {
            console.log(`\n   Registro ${index + 1}:`);
            console.log(`     ID: ${record.id}`);
            console.log(`     Outcome: ${record.conversation_outcome || 'NULL'}`);
            console.log(`     Intent: ${record.intent_detected || 'NULL'}`);
            console.log(`     Confidence: ${record.confidence_score || 'NULL'}`);
            console.log(`     API Cost: ${record.api_cost_usd || 'NULL'}`);
            console.log(`     Tokens: ${record.tokens_used || 'NULL'}`);
            console.log(`     Created: ${record.created_at}`);
        });

        // ========================================
        // 5. DISTRIBUIÇÕES REAIS
        // ========================================
        if (hasOutcome > 0) {
            console.log('\n🎯 DISTRIBUIÇÃO REAL DE OUTCOMES:');
            const outcomeDistribution = {};
            recentData.forEach(record => {
                if (record.conversation_outcome) {
                    outcomeDistribution[record.conversation_outcome] = (outcomeDistribution[record.conversation_outcome] || 0) + 1;
                }
            });
            
            Object.entries(outcomeDistribution)
                .sort(([,a], [,b]) => b - a)
                .forEach(([outcome, count]) => {
                    const percentage = ((count / hasOutcome) * 100).toFixed(1);
                    console.log(`     ${outcome}: ${count} (${percentage}%)`);
                });
        }

        if (hasIntent > 0) {
            console.log('\n🤖 DISTRIBUIÇÃO REAL DE INTENTS:');
            const intentDistribution = {};
            recentData.forEach(record => {
                if (record.intent_detected) {
                    intentDistribution[record.intent_detected] = (intentDistribution[record.intent_detected] || 0) + 1;
                }
            });
            
            Object.entries(intentDistribution)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .forEach(([intent, count]) => {
                    const percentage = ((count / hasIntent) * 100).toFixed(1);
                    console.log(`     ${intent}: ${count} (${percentage}%)`);
                });
        }

        // ========================================
        // 6. CONCLUSÃO REAL
        // ========================================
        console.log('\n' + '='.repeat(80));
        console.log('📋 CONCLUSÃO - DADOS REAIS');
        console.log('='.repeat(80));
        console.log(`✅ TENANT VALIDADO: ${tenantId}`);
        console.log(`📊 REGISTROS REAIS: ${totalRecords}`);
        console.log(`🎯 OUTCOMES: ${hasOutcome > 0 ? '✅' : '❌'} (${hasOutcome})`);
        console.log(`🤖 INTENTS: ${hasIntent > 0 ? '✅' : '❌'} (${hasIntent})`);
        console.log(`📊 CONFIDENCE: ${hasConfidence > 0 ? '✅' : '❌'} (${hasConfidence})`);
        console.log(`💰 CUSTOS: ${hasCost > 0 ? '✅' : '❌'} (${hasCost})`);
        console.log(`🔢 TOKENS: ${hasTokens > 0 ? '✅' : '❌'} (${hasTokens})`);

        const dataQuality = [hasOutcome, hasIntent, hasConfidence, hasCost, hasTokens].filter(x => x > 0).length;
        console.log(`\n📈 QUALIDADE DOS DADOS: ${dataQuality}/5 tipos disponíveis`);
        
        if (dataQuality === 0) {
            console.log('❌ NENHUM DADO ÚTIL PARA MÉTRICAS');
        } else if (dataQuality <= 2) {
            console.log('🟡 DADOS LIMITADOS - Métricas básicas possíveis');
        } else if (dataQuality <= 4) {
            console.log('🟢 DADOS BONS - Métricas avançadas possíveis');
        } else {
            console.log('🟢 DADOS EXCELENTES - Todas as métricas possíveis');
        }

    } catch (error) {
        console.error('❌ Erro durante verificação:', error.message);
        console.error(error.stack);
    }
}

// Executar verificação
checkRealConversationData();