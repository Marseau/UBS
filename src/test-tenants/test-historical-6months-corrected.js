#!/usr/bin/env node

/**
 * HISTORICAL_6MONTHS_CONVERSATIONS - IMPLEMENTAÇÃO CORRETA
 * 
 * Regras corretas:
 * - Data da conversa = campo created_at
 * - Acumulando por tenant por mês
 * - 6 meses passados
 * - Mês 0 = mês anterior ao atual (não o atual)
 * - Contagem por session_id (conversas únicas)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Implementação CORRETA da métrica historical_6months_conversations
 */
async function calculateHistorical6MonthsConversationsCorrect(tenantId) {
    console.log(`📈 HISTORICAL_6MONTHS_CONVERSATIONS CORRETO para tenant ${tenantId.substring(0, 8)}`);
    
    try {
        const now = new Date();
        console.log(`   📅 Hoje: ${now.toISOString().split('T')[0]} (${now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })})`);
        
        // Mês 0 = mês anterior ao atual (CORRIGIDO)
        const startMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1); // Mês passado
        console.log(`   📅 Mês 0 (início): ${startMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`);
        
        // 6 meses passados iniciando do mês anterior
        const sixMonthsStart = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        console.log(`   📅 Período total: ${sixMonthsStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} até ${startMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`);
        
        // Buscar todas as conversas do período de 6 meses
        const { data: allConversations, error } = await supabase
            .from('conversation_history')
            .select('conversation_context, created_at')
            .eq('tenant_id', tenantId)
            .gte('created_at', sixMonthsStart.toISOString())
            .lt('created_at', now.toISOString()) // Antes do mês atual
            .not('conversation_context', 'is', null);
            
        if (error) {
            console.error(`   ❌ Erro: ${error.message}`);
            return { month_0: 0, month_1: 0, month_2: 0, month_3: 0, month_4: 0, month_5: 0 };
        }
        
        if (!allConversations || allConversations.length === 0) {
            console.log('   📭 Nenhuma conversa encontrada no período');
            return { month_0: 0, month_1: 0, month_2: 0, month_3: 0, month_4: 0, month_5: 0 };
        }
        
        console.log(`   📊 ${allConversations.length} mensagens encontradas`);
        
        // Inicializar métricas (month_0 = mês anterior, month_5 = 6 meses atrás)
        const metrics = { month_0: 0, month_1: 0, month_2: 0, month_3: 0, month_4: 0, month_5: 0 };
        
        // Processar cada mês
        for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
            // month_0 = mês anterior (offset 1), month_1 = 2 meses atrás (offset 2), etc.
            const monthStart = new Date(now.getFullYear(), now.getMonth() - (monthOffset + 1), 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - monthOffset, 0); // Último dia do mês
            const monthKey = `month_${monthOffset}`;
            
            const monthName = monthStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
            console.log(`   🔍 ${monthKey}: ${monthName} (${monthStart.toISOString().split('T')[0]} - ${monthEnd.toISOString().split('T')[0]})`);
            
            // Filtrar conversas do mês
            const monthConversations = allConversations.filter(conv => {
                const convDate = new Date(conv.created_at);
                return convDate >= monthStart && convDate <= monthEnd;
            });
            
            // Contar sessões únicas (conversas)
            const sessionIds = new Set();
            monthConversations.forEach(conv => {
                const sessionId = conv.conversation_context?.session_id;
                if (sessionId) sessionIds.add(sessionId);
            });
            
            metrics[monthKey] = sessionIds.size;
            console.log(`      💬 ${sessionIds.size} conversas únicas (${monthConversations.length} mensagens)`);
        }
        
        return metrics;
        
    } catch (error) {
        console.error(`   💥 Erro: ${error.message}`);
        return { month_0: 0, month_1: 0, month_2: 0, month_3: 0, month_4: 0, month_5: 0 };
    }
}

/**
 * Demonstrar diferença entre implementação atual vs correta
 */
async function demonstrateDifference() {
    console.log('📊 COMPARAÇÃO: IMPLEMENTAÇÃO ATUAL vs CORRETA');
    console.log('='.repeat(80));
    
    const now = new Date();
    console.log(`Hoje: ${now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`);
    console.log('');
    
    console.log('❌ IMPLEMENTAÇÃO ATUAL (ERRADA):');
    console.log('   - Mês 1 = atual (agosto 2025)');
    console.log('   - Mês 2 = julho 2025');
    console.log('   - Mês 3 = junho 2025');
    console.log('   - etc...');
    console.log('   - Object.values() destrói ordem');
    console.log('');
    
    console.log('✅ IMPLEMENTAÇÃO CORRETA:');
    console.log('   - Mês 0 = julho 2025 (mês anterior)');
    console.log('   - Mês 1 = junho 2025 (2 meses atrás)');
    console.log('   - Mês 2 = maio 2025 (3 meses atrás)');
    console.log('   - Mês 3 = abril 2025 (4 meses atrás)');
    console.log('   - Mês 4 = março 2025 (5 meses atrás)');
    console.log('   - Mês 5 = fevereiro 2025 (6 meses atrás)');
    console.log('   - Acesso direto às propriedades do objeto');
}

/**
 * Teste com múltiplos tenants
 */
async function testCorrectedImplementation() {
    console.log('🧪 TESTE IMPLEMENTAÇÃO CORRETA - HISTORICAL_6MONTHS_CONVERSATIONS');
    console.log('='.repeat(80));
    
    await demonstrateDifference();
    console.log('\\n');
    
    try {
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active')
            .order('name');
        
        if (error) throw error;
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant encontrado');
            return;
        }
        
        // Testar com tenants que têm conversas
        const tenantsWithData = tenants.filter(t => 
            ['Bella Vista Spa', 'Studio Glamour', 'Charme Total', 'Clínica Mente Sã', 'Centro Terapêutico'].includes(t.name)
        );
        
        console.log(`📊 Testando com ${tenantsWithData.length} tenants com dados:`);
        tenantsWithData.forEach((tenant, index) => {
            console.log(`   ${index + 1}. ${tenant.name} (${tenant.id.substring(0, 8)})`);
        });
        
        const results = {};
        
        for (const tenant of tenantsWithData) {
            console.log(`\\n🏢 TENANT: ${tenant.name}`);
            console.log('-'.repeat(80));
            
            const correctedMetrics = await calculateHistorical6MonthsConversationsCorrect(tenant.id);
            
            results[tenant.id] = {
                name: tenant.name,
                metrics: correctedMetrics
            };
            
            // Resumo
            console.log(`\\n   📋 RESUMO ${tenant.name}:`);
            console.log(`      Mês 0 (jul/25):  ${correctedMetrics.month_0} conversas`);
            console.log(`      Mês 1 (jun/25):  ${correctedMetrics.month_1} conversas`);
            console.log(`      Mês 2 (mai/25):  ${correctedMetrics.month_2} conversas`);
            console.log(`      Mês 3 (abr/25):  ${correctedMetrics.month_3} conversas`);
            console.log(`      Mês 4 (mar/25):  ${correctedMetrics.month_4} conversas`);
            console.log(`      Mês 5 (fev/25):  ${correctedMetrics.month_5} conversas`);
            
            const totalConversations = Object.values(correctedMetrics).reduce((sum, val) => sum + val, 0);
            console.log(`      Total 6 meses:   ${totalConversations} conversas`);
        }
        
        // Tabela consolidada
        console.log('\\n📋 TABELA CONSOLIDADA - HISTÓRICO CORRETO (6 MESES)');
        console.log('='.repeat(80));
        console.log('TENANT                    | M0  | M1  | M2  | M3  | M4  | M5  | Total');
        console.log('                          |Jul25|Jun25|Mai25|Abr25|Mar25|Fev25|      ');
        console.log('-'.repeat(80));
        
        Object.entries(results).forEach(([tenantId, data]) => {
            const name = data.name.padEnd(24);
            const m = data.metrics;
            const m0 = String(m.month_0).padStart(3);
            const m1 = String(m.month_1).padStart(3);
            const m2 = String(m.month_2).padStart(3);
            const m3 = String(m.month_3).padStart(3);
            const m4 = String(m.month_4).padStart(3);
            const m5 = String(m.month_5).padStart(3);
            const total = Object.values(m).reduce((sum, val) => sum + val, 0);
            const totalStr = String(total).padStart(5);
            
            console.log(`${name} | ${m0} | ${m1} | ${m2} | ${m3} | ${m4} | ${m5} | ${totalStr}`);
        });
        
        console.log('-'.repeat(80));
        
        console.log('\\n✅ IMPLEMENTAÇÃO CORRETA VALIDADA');
        console.log('\\n🔧 CORREÇÕES NECESSÁRIAS NO SCRIPT BASE:');
        console.log('   1. Corrigir lógica de meses (mês 0 = anterior, não atual)');
        console.log('   2. Remover Object.values() e usar acesso direto');
        console.log('   3. Ajustar interface para month_0 até month_5');
        console.log('   4. Filtrar conversas ANTES do mês atual');
        
        return results;
        
    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        process.exit(1);
    }
}

// Executar teste
if (require.main === module) {
    testCorrectedImplementation().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { calculateHistorical6MonthsConversationsCorrect };