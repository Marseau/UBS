/**
 * GERADOR CSV POR SESSÃO DE CONVERSA
 * Context Engineering - Agregação por session_id
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Env vars missing');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function cleanCSV(value) {
    if (value === null || value === undefined) return '';
    
    const str = String(value);
    
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    
    return str;
}

async function generateConversationSessionsCSV() {
    try {
        console.log('🔄 Gerando CSV por SESSÃO DE CONVERSA...');
        
        // Buscar todas as conversas com session_id
        let allData = [];
        let page = 0;
        const pageSize = 1000;
        
        while (true) {
            const { data, error } = await supabase
                .from('conversation_history')
                .select(`
                    conversation_context,
                    created_at,
                    tenant_id,
                    user_id,
                    conversation_outcome,
                    intent_detected,
                    confidence_score,
                    tokens_used,
                    api_cost_usd,
                    processing_cost_usd,
                    tenants(name, business_name),
                    users(name)
                `)
                .not('conversation_context', 'is', null)
                .order('created_at', { ascending: false })
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (error) throw error;
            if (!data || data.length === 0) break;
            
            allData = allData.concat(data);
            console.log(`📄 Coletados ${allData.length} registros...`);
            
            if (data.length < pageSize) break;
            page++;
        }
        
        console.log(`✅ Total coletado: ${allData.length} registros`);
        
        // Agregar por session_id
        const sessionMap = new Map();
        
        for (const row of allData) {
            const sessionId = row.conversation_context?.session_id;
            if (!sessionId) continue;
            
            if (!sessionMap.has(sessionId)) {
                // Primeira mensagem da sessão - criar registro
                sessionMap.set(sessionId, {
                    session_id: sessionId,
                    tenant_id: row.tenant_id,
                    tenant_name: row.tenants?.name || '',
                    tenant_business_name: row.tenants?.business_name || '',
                    user_id: row.user_id,
                    user_name: row.users?.name || '',
                    duration_minutes: row.conversation_context?.duration_minutes || 0,
                    conversation_start: row.created_at,
                    conversation_end: row.created_at,
                    total_messages: 1,
                    final_outcome: row.conversation_outcome || '',
                    primary_intent: row.intent_detected || '',
                    avg_confidence: row.confidence_score || 0,
                    total_tokens: row.tokens_used || 0,
                    total_api_cost: row.api_cost_usd || 0,
                    total_processing_cost: row.processing_cost_usd || 0,
                    confidence_scores: row.confidence_score ? [row.confidence_score] : [],
                    has_outcome: !!row.conversation_outcome,
                    has_intent: !!row.intent_detected
                });
            } else {
                // Atualizar registro existente
                const session = sessionMap.get(sessionId);
                
                // Atualizar duração (pegar o maior valor)
                if (row.conversation_context?.duration_minutes > session.duration_minutes) {
                    session.duration_minutes = row.conversation_context.duration_minutes;
                }
                
                // Atualizar datas (início = mais antiga, fim = mais recente)
                if (new Date(row.created_at) < new Date(session.conversation_start)) {
                    session.conversation_start = row.created_at;
                }
                if (new Date(row.created_at) > new Date(session.conversation_end)) {
                    session.conversation_end = row.created_at;
                }
                
                // Incrementar contadores
                session.total_messages++;
                session.total_tokens += row.tokens_used || 0;
                session.total_api_cost += row.api_cost_usd || 0;
                session.total_processing_cost += row.processing_cost_usd || 0;
                
                // Atualizar outcome final (última mensagem com outcome)
                if (row.conversation_outcome) {
                    session.final_outcome = row.conversation_outcome;
                    session.has_outcome = true;
                }
                
                // Atualizar intent principal (último intent detectado)
                if (row.intent_detected) {
                    session.primary_intent = row.intent_detected;
                    session.has_intent = true;
                }
                
                // Atualizar confidence scores
                if (row.confidence_score) {
                    session.confidence_scores.push(row.confidence_score);
                }
            }
        }
        
        // Calcular médias finais e converter para array
        const sessions = Array.from(sessionMap.values()).map(session => {
            // Calcular confidence média
            if (session.confidence_scores.length > 0) {
                session.avg_confidence = session.confidence_scores.reduce((a, b) => a + b, 0) / session.confidence_scores.length;
            }
            
            // Remover array temporário
            delete session.confidence_scores;
            
            return session;
        });
        
        console.log(`🎯 Sessões únicas processadas: ${sessions.length}`);
        
        // Headers do CSV
        const headers = [
            'session_id',
            'tenant_id',
            'tenant_name',
            'tenant_business_name',
            'user_id',
            'user_name',
            'duration_minutes',
            'conversation_start',
            'conversation_end',
            'total_messages',
            'final_outcome',
            'primary_intent',
            'avg_confidence',
            'total_tokens',
            'total_api_cost',
            'total_processing_cost',
            'has_outcome',
            'has_intent'
        ];

        const csvLines = [headers.join(',')];

        for (const session of sessions) {
            const csvRow = [
                cleanCSV(session.session_id),
                cleanCSV(session.tenant_id),
                cleanCSV(session.tenant_name),
                cleanCSV(session.tenant_business_name),
                cleanCSV(session.user_id),
                cleanCSV(session.user_name),
                session.duration_minutes,
                cleanCSV(session.conversation_start),
                cleanCSV(session.conversation_end),
                session.total_messages,
                cleanCSV(session.final_outcome),
                cleanCSV(session.primary_intent),
                session.avg_confidence ? session.avg_confidence.toFixed(2).replace('.', ',') : '',
                session.total_tokens,
                session.total_api_cost ? session.total_api_cost.toFixed(6).replace('.', ',') : '',
                session.total_processing_cost ? session.total_processing_cost.toFixed(6).replace('.', ',') : '',
                session.has_outcome ? 'TRUE' : 'FALSE',
                session.has_intent ? 'TRUE' : 'FALSE'
            ];

            csvLines.push(csvRow.join(','));
        }

        // Salvar arquivo
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `conversation-sessions-${timestamp}.csv`;
        fs.writeFileSync(filename, csvLines.join('\n'), 'utf8');

        console.log(`✅ CSV por sessões: ${filename}`);
        console.log(`📊 ${csvLines.length - 1} sessões + cabeçalho`);
        console.log(`📈 Campos incluídos: ${headers.length}`);

        // Estatísticas
        const avgMessages = sessions.reduce((sum, s) => sum + s.total_messages, 0) / sessions.length;
        const avgDuration = sessions.reduce((sum, s) => sum + s.duration_minutes, 0) / sessions.length;
        const withOutcome = sessions.filter(s => s.has_outcome).length;
        const withIntent = sessions.filter(s => s.has_intent).length;

        console.log(`\n📊 ESTATÍSTICAS DAS SESSÕES:`);
        console.log(`   Média mensagens/sessão: ${avgMessages.toFixed(1)}`);
        console.log(`   Duração média: ${avgDuration.toFixed(1)} minutos`);
        console.log(`   Com outcome: ${withOutcome}/${sessions.length} (${((withOutcome/sessions.length)*100).toFixed(1)}%)`);
        console.log(`   Com intent: ${withIntent}/${sessions.length} (${((withIntent/sessions.length)*100).toFixed(1)}%)`);

        return { filename, success: true, totalSessions: sessions.length };

    } catch (error) {
        console.error('❌ Erro:', error.message);
        return { success: false };
    }
}

if (require.main === module) {
    generateConversationSessionsCSV()
        .then(result => {
            if (result.success) {
                console.log('\n🎉 CSV por SESSÕES gerado com SUCESSO!');
                console.log('✅ Cada linha = 1 conversa completa');
                console.log('✅ Coluna duration_minutes incluída');
                console.log('✅ Sem campos aninhados desnecessários');
            }
            process.exit(result.success ? 0 : 1);
        });
}