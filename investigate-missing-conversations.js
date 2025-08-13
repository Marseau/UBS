/**
 * INVESTIGAÇÃO: CONVERSAS NÃO PROCESSADAS
 * 
 * Investigar por que apenas 230/1041 conversas foram processadas pelo script de população
 * e identificar as conversas que faltam para completar a população
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Obter todas as conversas únicas (1041 total)
 */
async function getAllUniqueConversations() {
    console.log('🔍 Buscando TODAS as conversas únicas...');
    
    const { data, error } = await supabase
        .from('conversation_history')
        .select(`
            conversation_context,
            tenant_id,
            user_id,
            created_at,
            conversation_outcome
        `)
        .not('conversation_context->session_id', 'is', null)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('❌ Erro ao buscar conversation_history:', error);
        throw error;
    }

    // Agrupar por session_id
    const conversationMap = new Map();
    
    data.forEach(record => {
        const sessionId = record.conversation_context?.session_id;
        if (!sessionId) return;
        
        if (!conversationMap.has(sessionId)) {
            conversationMap.set(sessionId, {
                session_id: sessionId,
                tenant_id: record.tenant_id,
                user_id: record.user_id,
                conversation_start: record.created_at,
                conversation_end: record.created_at,
                conversation_outcome: record.conversation_outcome,
                message_count: 1
            });
        } else {
            const existing = conversationMap.get(sessionId);
            existing.message_count++;
            if (new Date(record.created_at) > new Date(existing.conversation_end)) {
                existing.conversation_end = record.created_at;
            }
            if (!existing.conversation_outcome && record.conversation_outcome) {
                existing.conversation_outcome = record.conversation_outcome;
            }
        }
    });

    const uniqueConversations = Array.from(conversationMap.values());
    console.log(`✅ Total de conversas únicas encontradas: ${uniqueConversations.length}`);
    
    return uniqueConversations;
}

/**
 * Obter conversas que já têm appointments linkados
 */
async function getConversationsWithAppointments() {
    console.log('🔗 Buscando conversas que já têm appointments...');
    
    const { data, error } = await supabase
        .from('appointments')
        .select('appointment_data');

    if (error) {
        console.error('❌ Erro ao buscar appointments:', error);
        throw error;
    }

    const linkedConversations = new Set();
    
    data.forEach(apt => {
        const appointmentData = apt.appointment_data || {};
        const conversationId = appointmentData.conversation_id || appointmentData.session_id;
        if (conversationId) {
            linkedConversations.add(conversationId);
        }
    });

    console.log(`✅ Conversas já linkadas a appointments: ${linkedConversations.size}`);
    return linkedConversations;
}

/**
 * Analisar diferenças entre conversas processadas e disponíveis
 */
function analyzeConversationGaps(allConversations, linkedConversations) {
    console.log('🔍 Analisando lacunas nas conversas processadas...');
    
    const analysis = {
        total: allConversations.length,
        alreadyLinked: 0,
        availableForProcessing: 0,
        missingData: [],
        tenantDistribution: new Map(),
        dateRangeAnalysis: {
            earliest: null,
            latest: null,
            byMonth: new Map()
        }
    };

    allConversations.forEach(conv => {
        const isLinked = linkedConversations.has(conv.session_id);
        
        if (isLinked) {
            analysis.alreadyLinked++;
        } else {
            analysis.availableForProcessing++;
            
            // Verificar se tem dados necessários
            if (!conv.tenant_id || !conv.user_id) {
                analysis.missingData.push({
                    session_id: conv.session_id,
                    missing_tenant: !conv.tenant_id,
                    missing_user: !conv.user_id,
                    conversation_start: conv.conversation_start
                });
            }
        }
        
        // Distribuição por tenant
        const tenantId = conv.tenant_id || 'null';
        analysis.tenantDistribution.set(
            tenantId, 
            (analysis.tenantDistribution.get(tenantId) || 0) + 1
        );
        
        // Análise de datas
        const startDate = new Date(conv.conversation_start);
        if (!analysis.dateRangeAnalysis.earliest || startDate < analysis.dateRangeAnalysis.earliest) {
            analysis.dateRangeAnalysis.earliest = startDate;
        }
        if (!analysis.dateRangeAnalysis.latest || startDate > analysis.dateRangeAnalysis.latest) {
            analysis.dateRangeAnalysis.latest = startDate;
        }
        
        const monthKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
        analysis.dateRangeAnalysis.byMonth.set(
            monthKey,
            (analysis.dateRangeAnalysis.byMonth.get(monthKey) || 0) + 1
        );
    });

    return analysis;
}

/**
 * Identificar conversas específicas que não foram processadas
 */
function identifyUnprocessedConversations(allConversations, linkedConversations) {
    console.log('🎯 Identificando conversas não processadas...');
    
    const unprocessed = allConversations.filter(conv => 
        !linkedConversations.has(conv.session_id)
    );
    
    // Agrupar por razões possíveis
    const categorization = {
        validForProcessing: [],
        missingTenant: [],
        missingUser: [],
        missingBoth: [],
        recentConversations: [],
        oldConversations: []
    };
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    unprocessed.forEach(conv => {
        const convDate = new Date(conv.conversation_start);
        
        if (!conv.tenant_id && !conv.user_id) {
            categorization.missingBoth.push(conv);
        } else if (!conv.tenant_id) {
            categorization.missingTenant.push(conv);
        } else if (!conv.user_id) {
            categorization.missingUser.push(conv);
        } else if (convDate > thirtyDaysAgo) {
            categorization.recentConversations.push(conv);
        } else if (convDate < new Date('2025-07-01')) {
            categorization.oldConversations.push(conv);
        } else {
            categorization.validForProcessing.push(conv);
        }
    });
    
    return { unprocessed, categorization };
}

/**
 * Função principal de investigação
 */
async function main() {
    try {
        console.log('🕵️ INVESTIGAÇÃO: CONVERSAS NÃO PROCESSADAS');
        console.log('='.repeat(70));
        
        // 1. Obter todas as conversas únicas
        const allConversations = await getAllUniqueConversations();
        
        // 2. Obter conversas que já têm appointments
        const linkedConversations = await getConversationsWithAppointments();
        
        // 3. Analisar lacunas
        const analysis = analyzeConversationGaps(allConversations, linkedConversations);
        
        // 4. Identificar conversas não processadas
        const { unprocessed, categorization } = identifyUnprocessedConversations(allConversations, linkedConversations);
        
        // 5. Relatório detalhado
        console.log('='.repeat(70));
        console.log('📊 RELATÓRIO DE INVESTIGAÇÃO');
        console.log('='.repeat(70));
        console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);
        console.log('');
        
        console.log('📈 NÚMEROS GERAIS:');
        console.log(`   Total conversas únicas: ${analysis.total}`);
        console.log(`   Já linkadas a appointments: ${analysis.alreadyLinked} (${((analysis.alreadyLinked/analysis.total)*100).toFixed(1)}%)`);
        console.log(`   Disponíveis para processamento: ${analysis.availableForProcessing} (${((analysis.availableForProcessing/analysis.total)*100).toFixed(1)}%)`);
        console.log(`   Conversas não processadas: ${unprocessed.length}`);
        console.log('');
        
        console.log('🏢 DISTRIBUIÇÃO POR TENANT:');
        Array.from(analysis.tenantDistribution.entries())
            .sort((a, b) => b[1] - a[1])
            .forEach(([tenantId, count]) => {
                const shortId = tenantId === 'null' ? 'SEM TENANT' : tenantId.substring(0, 8) + '...';
                console.log(`   ${shortId}: ${count} conversas`);
            });
        console.log('');
        
        console.log('📅 ANÁLISE TEMPORAL:');
        console.log(`   Período: ${analysis.dateRangeAnalysis.earliest?.toLocaleDateString('pt-BR')} a ${analysis.dateRangeAnalysis.latest?.toLocaleDateString('pt-BR')}`);
        console.log('   Distribuição mensal:');
        Array.from(analysis.dateRangeAnalysis.byMonth.entries())
            .sort()
            .forEach(([month, count]) => {
                console.log(`     ${month}: ${count} conversas`);
            });
        console.log('');
        
        console.log('🔍 CATEGORIZAÇÃO DAS CONVERSAS NÃO PROCESSADAS:');
        console.log(`   Válidas para processamento: ${categorization.validForProcessing.length}`);
        console.log(`   Sem tenant_id: ${categorization.missingTenant.length}`);
        console.log(`   Sem user_id: ${categorization.missingUser.length}`);
        console.log(`   Sem tenant_id e user_id: ${categorization.missingBoth.length}`);
        console.log(`   Conversas recentes (< 30 dias): ${categorization.recentConversations.length}`);
        console.log(`   Conversas antigas (< Jul/2025): ${categorization.oldConversations.length}`);
        console.log('');
        
        console.log('🎯 PRÓXIMOS PASSOS:');
        if (categorization.validForProcessing.length > 0) {
            console.log(`   ✅ ${categorization.validForProcessing.length} conversas podem ser processadas imediatamente`);
        }
        if (categorization.missingTenant.length > 0 || categorization.missingUser.length > 0) {
            console.log(`   ⚠️ ${categorization.missingTenant.length + categorization.missingUser.length} conversas precisam de correção de dados`);
        }
        if (categorization.recentConversations.length > 0) {
            console.log(`   📅 ${categorization.recentConversations.length} conversas recentes podem aguardar processamento`);
        }
        
        console.log('');
        console.log('💡 RESUMO DA INVESTIGAÇÃO:');
        
        const processableNow = categorization.validForProcessing.length;
        const needsDataFix = categorization.missingTenant.length + categorization.missingUser.length + categorization.missingBoth.length;
        const canWait = categorization.recentConversations.length + categorization.oldConversations.length;
        
        console.log(`   Processáveis agora: ${processableNow}`);
        console.log(`   Precisam correção: ${needsDataFix}`);
        console.log(`   Podem aguardar: ${canWait}`);
        console.log(`   Total verificado: ${processableNow + needsDataFix + canWait} = ${unprocessed.length} ✅`);
        
        console.log('='.repeat(70));
        
        // Retornar dados para o próximo script
        return {
            allConversations,
            linkedConversations,
            unprocessed,
            categorization,
            analysis
        };
        
    } catch (error) {
        console.error('❌ Erro durante a investigação:', error);
        process.exit(1);
    }
}

// Executar se for chamado diretamente
if (require.main === module) {
    main();
}

module.exports = { main };