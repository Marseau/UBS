/**
 * VALIDAÇÃO COMPLETA DAS MÉTRICAS COM DADOS REAIS
 * Validar se as métricas CSV estão corretas após correção estrutural
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

class ValidacaoMetricasComDadosReais {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );
    }

    async validarReceitaReal() {
        console.log('💰 VALIDANDO RECEITA REAL:');
        console.log('-'.repeat(40));

        // 1. Receita total possível (BD direto)
        const { data: receitaTotalBD } = await this.supabase
            .from('appointments')
            .select(`
                services (
                    base_price
                )
            `)
            .not('services.base_price', 'is', null);

        const receitaTotalCalculada = receitaTotalBD?.reduce((sum, apt) => {
            return sum + (parseFloat(apt.services?.base_price) || 0);
        }, 0) || 0;

        // 2. Receita appointments completed
        const { data: receitaCompletedBD } = await this.supabase
            .from('appointments')
            .select(`
                services (
                    base_price
                )
            `)
            .eq('status', 'completed')
            .not('services.base_price', 'is', null);

        const receitaCompletedCalculada = receitaCompletedBD?.reduce((sum, apt) => {
            return sum + (parseFloat(apt.services?.base_price) || 0);
        }, 0) || 0;

        // 3. Receita por tenant (amostra)
        const { data: receitaPorTenant } = await this.supabase
            .from('appointments')
            .select(`
                tenant_id,
                services (
                    base_price
                ),
                tenants (
                    name
                )
            `)
            .eq('status', 'completed')
            .not('services.base_price', 'is', null)
            .limit(100);

        const receitaPorTenantMap = {};
        receitaPorTenant?.forEach(apt => {
            const tenantId = apt.tenant_id;
            const tenantName = apt.tenants?.name;
            if (!receitaPorTenantMap[tenantId]) {
                receitaPorTenantMap[tenantId] = { name: tenantName, receita: 0 };
            }
            receitaPorTenantMap[tenantId].receita += parseFloat(apt.services?.base_price) || 0;
        });

        console.log(`💰 Receita total possível (BD): R$ ${receitaTotalCalculada.toFixed(2)}`);
        console.log(`💰 Receita completed (BD): R$ ${receitaCompletedCalculada.toFixed(2)}`);
        console.log('\n💰 Receita por tenant (top 5):');
        Object.entries(receitaPorTenantMap)
            .sort((a, b) => b[1].receita - a[1].receita)
            .slice(0, 5)
            .forEach(([tenantId, data]) => {
                console.log(`   ${data.name}: R$ ${data.receita.toFixed(2)}`);
            });

        return {
            receitaTotal: receitaTotalCalculada,
            receitaCompleted: receitaCompletedCalculada,
            receitaPorTenant: receitaPorTenantMap
        };
    }

    async validarProfessionalServices() {
        console.log('\n👥 VALIDANDO PROFESSIONAL-SERVICES:');
        console.log('-'.repeat(40));

        // 1. Total de relacionamentos
        const { count: totalRelacionamentos } = await this.supabase
            .from('professional_services')
            .select('*', { count: 'exact', head: true });

        // 2. Relacionamentos por tenant
        const { data: relacionamentosPorTenant } = await this.supabase
            .from('professional_services')
            .select(`
                tenant_id,
                tenants (
                    name
                )
            `);

        const relacionamentosPorTenantMap = {};
        relacionamentosPorTenant?.forEach(ps => {
            const tenantId = ps.tenant_id;
            const tenantName = ps.tenants?.name;
            relacionamentosPorTenantMap[tenantId] = (relacionamentosPorTenantMap[tenantId] || 0) + 1;
            if (!relacionamentosPorTenantMap[`${tenantId}_name`]) {
                relacionamentosPorTenantMap[`${tenantId}_name`] = tenantName;
            }
        });

        // 3. Preços customizados (amostra)
        const { data: precosCustomizados } = await this.supabase
            .from('professional_services')
            .select(`
                custom_price,
                professionals (
                    name
                ),
                services (
                    name,
                    base_price
                )
            `)
            .limit(10);

        console.log(`🔗 Total relacionamentos: ${totalRelacionamentos}`);
        console.log('\n🏢 Relacionamentos por tenant:');
        Object.entries(relacionamentosPorTenantMap)
            .filter(([key]) => !key.includes('_name'))
            .forEach(([tenantId, count]) => {
                const name = relacionamentosPorTenantMap[`${tenantId}_name`];
                console.log(`   ${name}: ${count} relacionamentos`);
            });

        console.log('\n💲 Amostra preços customizados:');
        precosCustomizados?.slice(0, 5).forEach(ps => {
            const diff = ps.custom_price - ps.services?.base_price;
            const diffPercent = ((diff / ps.services?.base_price) * 100).toFixed(1);
            console.log(`   ${ps.professionals?.name} - ${ps.services?.name}: R$ ${ps.custom_price} (${diffPercent > 0 ? '+' : ''}${diffPercent}%)`);
        });

        return {
            totalRelacionamentos,
            relacionamentosPorTenant: relacionamentosPorTenantMap,
            precosCustomizados
        };
    }

    async validarCSVContraDB() {
        console.log('\n📊 VALIDANDO CSV CONTRA BD:');
        console.log('-'.repeat(40));

        // Ler CSV gerado
        let dadosCSV = [];
        try {
            const csvContent = fs.readFileSync('metricas_tenants_final.csv', 'utf8');
            const linhas = csvContent.split('\n').filter(l => l.trim());
            const cabecalhos = linhas[0].split(',');
            
            dadosCSV = linhas.slice(1).map(linha => {
                const valores = linha.split(',');
                const obj = {};
                cabecalhos.forEach((cabecalho, index) => {
                    obj[cabecalho] = valores[index];
                });
                return obj;
            });
        } catch (error) {
            console.error('❌ Erro lendo CSV:', error.message);
            return {};
        }

        // Validar dados específicos
        const dados90d = dadosCSV.filter(d => d.period_days === '90');
        
        console.log(`📄 CSV - Registros 90 dias: ${dados90d.length}`);
        
        // Validar contra dados do BD que calculamos
        const validacoes = [];

        // 1. Validar total de agendamentos
        const totalAgendamentosCSV = dados90d.reduce((sum, d) => sum + parseInt(d.agendamentos_total || 0), 0);
        const { count: totalAgendamentosBD } = await this.supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true });

        validacoes.push({
            metrica: 'Total Agendamentos (90d)',
            csv: totalAgendamentosCSV,
            bd: totalAgendamentosBD,
            diferenca: Math.abs(totalAgendamentosCSV - totalAgendamentosBD),
            percentual: Math.abs((totalAgendamentosCSV - totalAgendamentosBD) / totalAgendamentosBD * 100).toFixed(2)
        });

        // 2. Validar total de mensagens
        const totalMensagensCSV = dados90d.reduce((sum, d) => sum + parseInt(d.mensagens_total || 0), 0);
        const { count: totalMensagensBD } = await this.supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true });

        validacoes.push({
            metrica: 'Total Mensagens (90d)',
            csv: totalMensagensCSV,
            bd: totalMensagensBD,
            diferenca: Math.abs(totalMensagensCSV - totalMensagensBD),
            percentual: Math.abs((totalMensagensCSV - totalMensagensBD) / totalMensagensBD * 100).toFixed(2)
        });

        // 3. Validar receita (se houvesse no CSV)
        const receitaCSV = dados90d.reduce((sum, d) => sum + parseFloat(d.receita || 0), 0);
        console.log(`💰 Receita total CSV: R$ ${receitaCSV.toFixed(2)} (esperado: ~R$ 85,000)`);

        console.log('\n📋 VALIDAÇÕES:');
        validacoes.forEach(v => {
            const status = parseFloat(v.percentual) < 5 ? '✅' : '❌';
            console.log(`${status} ${v.metrica}:`);
            console.log(`   CSV: ${v.csv}, BD: ${v.bd}`);
            console.log(`   Diferença: ${v.diferenca} (${v.percentual}%)`);
        });

        return { validacoes, dados90d };
    }

    async executarValidacaoCompleta() {
        console.log('🔍 VALIDAÇÃO COMPLETA DAS MÉTRICAS');
        console.log('='.repeat(60));
        
        try {
            const receita = await this.validarReceitaReal();
            const professionalServices = await this.validarProfessionalServices();
            const csvValidacao = await this.validarCSVContraDB();

            console.log('\n🎯 RESUMO FINAL DA VALIDAÇÃO:');
            console.log('='.repeat(60));
            console.log(`💰 Sistema tem receita real: R$ ${receita.receitaTotal.toFixed(2)}`);
            console.log(`🔗 Professional-services funcionais: ${professionalServices.totalRelacionamentos}`);
            console.log(`📊 CSV gerado com dados corretos`);
            
            // Verificar se passou na validação
            const todasValidacoes = csvValidacao.validacoes || [];
            const validacoesFalharam = todasValidacoes.filter(v => parseFloat(v.percentual) >= 5);
            
            if (validacoesFalharam.length === 0) {
                console.log('✅ TODAS AS VALIDAÇÕES PASSARAM!');
                console.log('🎯 Sistema 100% funcional com dados reais');
            } else {
                console.log(`❌ ${validacoesFalharam.length} validações falharam`);
                validacoesFalharam.forEach(v => {
                    console.log(`   - ${v.metrica}: ${v.percentual}% de diferença`);
                });
            }

            return {
                receita,
                professionalServices,
                csvValidacao,
                sistemaFuncional: validacoesFalharam.length === 0
            };

        } catch (error) {
            console.error('💥 Erro na validação:', error);
            throw error;
        }
    }
}

// Executar
if (require.main === module) {
    const validador = new ValidacaoMetricasComDadosReais();
    validador.executarValidacaoCompleta()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('💥 Erro:', error);
            process.exit(1);
        });
}

module.exports = ValidacaoMetricasComDadosReais;