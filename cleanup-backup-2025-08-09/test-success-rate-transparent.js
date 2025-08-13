/**
 * TESTE TRANSPARENTE - SUCCESS RATE COM start_time
 * 
 * Formato com transparência total:
 * - Usar start_time (data real do serviço)
 * - Mostrar TOTAL, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW, SUCCESS, RATE
 * - Análise por tenant e período
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Análise transparente com todas as colunas
 */
async function transparentSuccessRateAnalysis() {
    console.log('📊 SUCCESS RATE ANALYSIS - TRANSPARÊNCIA TOTAL (start_time)');
    console.log('='.repeat(100));
    
    try {
        // 1. Obter todos os tenants
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, name, domain')
            .order('name');
        
        if (tenantsError) {
            console.error('❌ Erro ao buscar tenants:', tenantsError);
            return;
        }
        
        // 2. Períodos a analisar
        const periods = ['7d', '30d', '90d'];
        
        for (const period of periods) {
            const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - periodDays);
            
            console.log(`📅 PERÍODO: ${period.toUpperCase()} (${startDate.toLocaleDateString('pt-BR')} - ${endDate.toLocaleDateString('pt-BR')})`);
            console.log('='.repeat(100));
            
            // Cabeçalho da tabela
            console.log(
                'TENANT'.padEnd(25) + 
                'TOTAL'.padEnd(8) + 
                'CONFIRMED'.padEnd(12) + 
                'COMPLETED'.padEnd(12) + 
                'CANCELLED'.padEnd(12) + 
                'NO_SHOW'.padEnd(10) + 
                'SUCCESS'.padEnd(10) + 
                'RATE'
            );
            console.log('-'.repeat(100));
            
            let globalStats = {
                total: 0,
                confirmed: 0,
                completed: 0,
                cancelled: 0,
                no_show: 0
            };
            
            // 3. Analisar cada tenant
            for (const tenant of tenants) {
                // Buscar appointments usando start_time (data real do serviço)
                const { data: appointments, error: appointmentsError } = await supabase
                    .from('appointments')
                    .select('id, status, start_time')
                    .eq('tenant_id', tenant.id)
                    .gte('start_time', startDate.toISOString())
                    .lte('start_time', endDate.toISOString());
                
                if (appointmentsError) {
                    console.error(`❌ Erro para ${tenant.name}:`, appointmentsError);
                    continue;
                }
                
                if (!appointments || appointments.length === 0) {
                    // Tenant sem appointments no período
                    console.log(
                        `${tenant.name.substring(0, 24).padEnd(25)}` +
                        `${'0'.padEnd(8)}` +
                        `${'0'.padEnd(12)}` +
                        `${'0'.padEnd(12)}` +
                        `${'0'.padEnd(12)}` +
                        `${'0'.padEnd(10)}` +
                        `${'0'.padEnd(10)}` +
                        `${'0.0%'}`
                    );
                    continue;
                }
                
                // 4. Calcular estatísticas do tenant
                const stats = {
                    total: appointments.length,
                    confirmed: appointments.filter(apt => apt.status === 'confirmed').length,
                    completed: appointments.filter(apt => apt.status === 'completed').length,
                    cancelled: appointments.filter(apt => apt.status === 'cancelled').length,
                    no_show: appointments.filter(apt => apt.status === 'no_show').length
                };
                
                const success = stats.confirmed + stats.completed;
                const successRate = stats.total > 0 ? (success / stats.total * 100).toFixed(1) : '0.0';
                
                // Atualizar estatísticas globais
                globalStats.total += stats.total;
                globalStats.confirmed += stats.confirmed;
                globalStats.completed += stats.completed;
                globalStats.cancelled += stats.cancelled;
                globalStats.no_show += stats.no_show;
                
                // 5. Exibir linha do tenant
                console.log(
                    `${tenant.name.substring(0, 24).padEnd(25)}` +
                    `${stats.total.toString().padEnd(8)}` +
                    `${stats.confirmed.toString().padEnd(12)}` +
                    `${stats.completed.toString().padEnd(12)}` +
                    `${stats.cancelled.toString().padEnd(12)}` +
                    `${stats.no_show.toString().padEnd(10)}` +
                    `${success.toString().padEnd(10)}` +
                    `${successRate}%`
                );
            }
            
            // 6. Linha de totais da plataforma
            const globalSuccess = globalStats.confirmed + globalStats.completed;
            const globalRate = globalStats.total > 0 ? (globalSuccess / globalStats.total * 100).toFixed(1) : '0.0';
            
            console.log('-'.repeat(100));
            console.log(
                `${'=== TOTAL PLATAFORMA ==='.padEnd(25)}` +
                `${globalStats.total.toString().padEnd(8)}` +
                `${globalStats.confirmed.toString().padEnd(12)}` +
                `${globalStats.completed.toString().padEnd(12)}` +
                `${globalStats.cancelled.toString().padEnd(12)}` +
                `${globalStats.no_show.toString().padEnd(10)}` +
                `${globalSuccess.toString().padEnd(10)}` +
                `${globalRate}%`
            );
            
            // 7. Resumo percentual
            if (globalStats.total > 0) {
                console.log('');
                console.log('📊 RESUMO PERCENTUAL:');
                console.log(`   ✅ Confirmed: ${(globalStats.confirmed / globalStats.total * 100).toFixed(1)}%`);
                console.log(`   ✅ Completed: ${(globalStats.completed / globalStats.total * 100).toFixed(1)}%`);
                console.log(`   ❌ Cancelled: ${(globalStats.cancelled / globalStats.total * 100).toFixed(1)}%`);
                console.log(`   ❌ No Show: ${(globalStats.no_show / globalStats.total * 100).toFixed(1)}%`);
                console.log(`   🎯 SUCCESS RATE: ${globalRate}%`);
            }
            
            console.log('');
            console.log('='.repeat(100));
            console.log('');
        }
        
        // 8. Análise de distribuição temporal usando start_time
        console.log('📅 ANÁLISE TEMPORAL (baseada em start_time)');
        console.log('='.repeat(60));
        
        const { data: allAppointments, error: allError } = await supabase
            .from('appointments')
            .select('id, status, start_time')
            .order('start_time', { ascending: true });
        
        if (!allError && allAppointments && allAppointments.length > 0) {
            // Distribuição por data de serviço
            const dateDistribution = {};
            allAppointments.forEach(apt => {
                const serviceDate = new Date(apt.start_time).toLocaleDateString('pt-BR');
                if (!dateDistribution[serviceDate]) {
                    dateDistribution[serviceDate] = { total: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
                }
                dateDistribution[serviceDate].total++;
                dateDistribution[serviceDate][apt.status]++;
            });
            
            console.log('🗓️ Distribuição por data de serviço (top 10):');
            Object.entries(dateDistribution)
                .sort((a, b) => b[1].total - a[1].total)
                .slice(0, 10)
                .forEach(([date, stats]) => {
                    const success = stats.confirmed + stats.completed;
                    const rate = (success / stats.total * 100).toFixed(1);
                    console.log(`   ${date}: ${stats.total} total, ${success} success (${rate}%) - Conf:${stats.confirmed} Comp:${stats.completed} Canc:${stats.cancelled} NoShow:${stats.no_show}`);
                });
            
            // Range temporal
            const oldest = new Date(Math.min(...allAppointments.map(apt => new Date(apt.start_time))));
            const newest = new Date(Math.max(...allAppointments.map(apt => new Date(apt.start_time))));
            console.log('');
            console.log(`📈 Range temporal: ${oldest.toLocaleDateString('pt-BR')} até ${newest.toLocaleDateString('pt-BR')}`);
        }
        
        console.log('');
        console.log('✅ ANÁLISE TRANSPARENTE CONCLUÍDA');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('❌ Erro durante análise:', error);
    }
}

/**
 * Executar análise
 */
async function main() {
    await transparentSuccessRateAnalysis();
}

main().catch(console.error);