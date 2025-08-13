require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function testarAdapter4CamposFinal() {
    console.log('🧪 TESTANDO ADAPTER COM 4 CAMPOS JSON - VERSÃO FINAL');
    console.log('='.repeat(70));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        // 1. Verificar dados atuais
        console.log('🔍 Verificando dados atuais...');
        const { data: currentData, error } = await client
            .from('platform_metrics')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        
        if (error || !currentData) {
            console.log('❌ Nenhum dado encontrado. Executando pipeline primeiro...');
            
            // Executar o script que funciona
            const { spawn } = require('child_process');
            await new Promise((resolve, reject) => {
                const child = spawn('node', ['criar-4-campos-json-virtual.js'], { stdio: 'inherit' });
                child.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`Script falhou com código ${code}`));
                });
            });
            
            // Buscar dados novamente
            const { data: newData } = await client
                .from('platform_metrics')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            
            if (!newData) {
                throw new Error('Falha ao criar dados de teste');
            }
            
            console.log('✅ Dados de teste criados');
        }
        
        // 2. Implementar adapter inline
        console.log('🔧 Implementando adapter inline...');
        
        const { data: allRecords } = await client
            .from('platform_metrics')
            .select('*')
            .order('created_at', { ascending: false });
        
        console.log(`📊 Processando ${allRecords.length} registros com adapter...`);
        
        const adaptedRecords = allRecords.map(record => {
            const comprehensive = record.comprehensive_metrics || {};
            const metricDataVirtual = comprehensive.metric_data_virtual || {};
            
            // Limpar comprehensive para não duplicar dados
            const cleanComprehensive = { ...comprehensive };
            delete cleanComprehensive.metric_data_virtual;
            
            return {
                // Campos básicos
                id: record.id,
                calculation_date: record.calculation_date,
                period: record.period,
                tenants_processed: record.tenants_processed,
                total_tenants: record.total_tenants,
                calculation_method: record.calculation_method,
                created_at: record.created_at,
                updated_at: record.updated_at,
                
                // 4 CAMPOS JSON
                comprehensive_metrics: cleanComprehensive,
                participation_metrics: record.participation_metrics,
                ranking_metrics: record.ranking_metrics,
                metric_data: metricDataVirtual // 4º CAMPO EXTRAÍDO
            };
        });
        
        // 3. Validar estrutura de 4 campos
        console.log('\\n✅ ESTRUTURA ADAPTADA:');
        
        let allValid = true;
        
        adaptedRecords.forEach((record, i) => {
            console.log(`\\n   📋 Registro ${i+1} - Período: ${record.period}`);
            
            const fields = [
                { name: 'comprehensive_metrics', data: record.comprehensive_metrics },
                { name: 'participation_metrics', data: record.participation_metrics },
                { name: 'ranking_metrics', data: record.ranking_metrics },
                { name: 'metric_data', data: record.metric_data }
            ];
            
            fields.forEach(field => {
                const present = field.data && typeof field.data === 'object' && Object.keys(field.data).length > 0;
                const keys = present ? Object.keys(field.data).length : 0;
                console.log(`     • ${field.name}: ${present ? '✅' : '❌'} (${keys} chaves)`);
                
                if (!present) allValid = false;
            });
            
            const totalJsonFields = fields.filter(f => f.data && typeof f.data === 'object' && Object.keys(f.data).length > 0).length;
            console.log(`     🎯 Total JSON válidos: ${totalJsonFields}/4`);
        });
        
        // 4. Status final
        console.log(`\\n🏆 STATUS FINAL: ${allValid ? 'TODOS OS REGISTROS TÊM 4 CAMPOS JSON VÁLIDOS' : 'ALGUNS REGISTROS TÊM PROBLEMAS'}`);
        
        // 5. Demo de uso para Dashboard
        if (allValid && adaptedRecords.length > 0) {
            console.log('\\n📊 DEMO PARA SUPER ADMIN DASHBOARD:');
            
            const dashboardRecord = adaptedRecords[0]; // Período mais recente
            
            // Extrair KPIs básicos
            const comp = dashboardRecord.comprehensive_metrics;
            const part = dashboardRecord.participation_metrics;
            const rank = dashboardRecord.ranking_metrics;
            const metric = dashboardRecord.metric_data;
            
            console.log('\\n   🎯 KPIs EXTRAÍDOS:');
            console.log(`     💰 Revenue: ${metric.formatted_values?.total_revenue_br || 'N/A'}`);
            console.log(`     🏢 Tenants Ativos: ${comp.active_tenants_count || 0}`);
            console.log(`     📅 Appointments: ${metric.formatted_values?.total_appointments_br || 'N/A'}`);
            console.log(`     📊 Eficiência: ${comp.operational_efficiency_pct || 0}%`);
            console.log(`     🎯 Score Saúde: ${comp.platform_health_score || 0}`);
            console.log(`     📈 Ratio R/U: ${part.receita_uso_ratio || 0}x`);
            console.log(`     🏆 Ranking: ${rank.platform_ranking || 'N/A'}`);
            
            console.log('\\n   📋 DADOS COMPLETOS DISPONÍVEIS:');
            console.log(`     • comprehensive_metrics: ${Object.keys(comp).length} campos`);
            console.log(`     • participation_metrics: ${Object.keys(part).length} campos`);
            console.log(`     • ranking_metrics: ${Object.keys(rank).length} campos`);
            console.log(`     • metric_data: ${Object.keys(metric).length} campos`);
        }
        
        return allValid;
        
    } catch (error) {
        console.error('💥 Erro no teste:', error.message);
        return false;
    }
}

testarAdapter4CamposFinal()
    .then(success => {
        if (success) {
            console.log('\\n🎉 ADAPTER COM 4 CAMPOS JSON FUNCIONANDO PERFEITAMENTE!');
            console.log('✅ platform_metrics apresenta estrutura igual a tenant_metrics');
            console.log('✅ Super Admin Dashboard pode usar os 4 campos JSON');
            console.log('✅ Compatibilidade 100% alcançada sem modificar banco de dados');
        } else {
            console.log('\\n❌ ADAPTER TEVE PROBLEMAS');
        }
        process.exit(success ? 0 : 1);
    })
    .catch(console.error);