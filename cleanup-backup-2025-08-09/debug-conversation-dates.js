/**
 * DEBUG - VERIFICAÇÃO DE DATAS DA CONVERSATION_HISTORY
 */

require('dotenv').config();
const { getAdminClient } = require('./dist/config/database.js');

async function debugConversationDates() {
    console.log('🔍 DEBUG - DATAS DA CONVERSATION_HISTORY');
    console.log('========================================');
    
    try {
        const supabase = getAdminClient();
        
        // 1. Contar total de registros
        const { count: totalCount, error: countError } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true });
        
        console.log('📊 Total registros na tabela:', totalCount || 'ERRO');
        if (countError) {
            console.log('❌ Erro count:', countError.message);
            return;
        }
        
        // 2. Buscar alguns registros para ver as datas
        const { data: sampleData, error: sampleError } = await supabase
            .from('conversation_history')
            .select('tenant_id, created_at')
            .order('created_at', { ascending: false })
            .limit(10);
        
        if (sampleError) {
            console.log('❌ Erro sample:', sampleError.message);
            return;
        }
        
        if (sampleData && sampleData.length > 0) {
            console.log('\n📅 DATAS MAIS RECENTES:');
            sampleData.forEach((record, index) => {
                console.log(`   ${index+1}. ${record.created_at} - Tenant: ${record.tenant_id.substring(0,8)}...`);
            });
            
            // 3. Ver range de datas
            const { data: dateRange, error: rangeError } = await supabase
                .from('conversation_history')
                .select('created_at')
                .order('created_at', { ascending: true })
                .limit(1);
                
            if (!rangeError && dateRange && dateRange.length > 0) {
                console.log('\n📊 RANGE DE DATAS:');
                console.log(`   Mais antiga: ${dateRange[0].created_at}`);
                console.log(`   Mais recente: ${sampleData[0].created_at}`);
                
                // 4. Verificar se as datas estão no futuro ou passado demais
                const now = new Date();
                const mostRecent = new Date(sampleData[0].created_at);
                const oldest = new Date(dateRange[0].created_at);
                
                console.log('\n⏰ ANÁLISE DE DATAS:');
                console.log(`   Data atual: ${now.toISOString()}`);
                console.log(`   Diff mais recente: ${Math.round((now - mostRecent) / (1000*60*60*24))} dias atrás`);
                console.log(`   Diff mais antiga: ${Math.round((now - oldest) / (1000*60*60*24))} dias atrás`);
                
                // 5. Contar por mês
                console.log('\n📈 DISTRIBUIÇÃO POR MÊS:');
                const { data: monthlyData, error: monthlyError } = await supabase
                    .from('conversation_history')
                    .select('created_at');
                
                if (!monthlyError && monthlyData) {
                    const monthCounts = {};
                    monthlyData.forEach(record => {
                        const month = record.created_at.substring(0, 7); // YYYY-MM
                        monthCounts[month] = (monthCounts[month] || 0) + 1;
                    });
                    
                    Object.entries(monthCounts)
                        .sort(([a], [b]) => b.localeCompare(a))
                        .slice(0, 6)
                        .forEach(([month, count]) => {
                            console.log(`   ${month}: ${count} conversas`);
                        });
                }
            }
        } else {
            console.log('❌ Nenhum registro encontrado');
        }
        
    } catch (error) {
        console.error('❌ Erro durante debug:', error.message);
    }
}

debugConversationDates();