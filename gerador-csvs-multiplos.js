/**
 * GERADOR DE CSVs MÚLTIPLOS - ESTRUTURA CORRETA
 * 4 CSVs separados:
 * 1. Principal: métricas gerais por tenant
 * 2. Receita por Funcionário: tenant, data, agendamento, funcionário, receita
 * 3. Receita por Serviço: tenant, data, agendamento, serviço, receita  
 * 4. Receita por Cliente: tenant, data, agendamento, cliente, receita
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

class GeradorCSVsMultiplos {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );
    }

    // Formatar número brasileiro (vírgula decimal)
    formatarNumero(numero) {
        return Number(numero).toLocaleString('pt-BR', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        });
    }

    // Salvar CSV com separador brasileiro (;)
    salvarCSV(dados, nomeArquivo, cabecalhos) {
        let csv = cabecalhos.join(';') + '\n';
        
        dados.forEach(linha => {
            const valores = cabecalhos.map(campo => {
                let valor = linha[campo] ?? '';
                
                // Formatar números
                if (typeof valor === 'number') {
                    valor = this.formatarNumero(valor);
                }
                
                // Escapar strings com vírgula/ponto-e-vírgula
                if (typeof valor === 'string' && (valor.includes(';') || valor.includes(','))) {
                    valor = `"${valor}"`;
                }
                
                return valor;
            });
            csv += valores.join(';') + '\n';
        });

        fs.writeFileSync(nomeArquivo, csv);
        console.log(`💾 CSV salvo: ${nomeArquivo} (${dados.length} registros)`);
    }

    async getTenants() {
        const { data, error } = await this.supabase
            .from('tenants')
            .select('id, name, status, subscription_plan, created_at');
        
        if (error) throw error;
        return data;
    }

    async gerarCSVPrincipal(tenants, periodos) {
        console.log('📊 Gerando CSV Principal...');
        const dadosPrincipais = [];

        for (const tenant of tenants) {
            for (const periodo of periodos) {
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - periodo.dias);
                const startDateStr = startDate.toISOString();

                // Métricas básicas
                const { count: agendamentos } = await this.supabase
                    .from('appointments')
                    .select('*', { count: 'exact', head: true })
                    .eq('tenant_id', tenant.id)
                    .gte('created_at', startDateStr);

                const { count: conversas } = await this.supabase
                    .from('conversation_history')
                    .select('*', { count: 'exact', head: true })
                    .eq('tenant_id', tenant.id)
                    .gte('created_at', startDateStr);

                // Receita total
                const { data: receitaData } = await this.supabase
                    .from('appointments')
                    .select(`
                        services (
                            base_price
                        )
                    `)
                    .eq('tenant_id', tenant.id)
                    .eq('status', 'completed')
                    .not('services.base_price', 'is', null)
                    .gte('created_at', startDateStr);

                const receitaTotal = receitaData?.reduce((sum, apt) => {
                    return sum + (parseFloat(apt.services?.base_price) || 0);
                }, 0) || 0;

                dadosPrincipais.push({
                    tenant_id: tenant.id,
                    tenant_name: tenant.name,
                    period_days: periodo.dias,
                    start_date: startDate.toISOString().split('T')[0],
                    receita_total: receitaTotal,
                    agendamentos_total: agendamentos || 0,
                    conversas_total: conversas || 0
                });

                console.log(`   ✅ ${tenant.name} (${periodo.dias}d): R$ ${this.formatarNumero(receitaTotal)}`);
            }
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
        this.salvarCSV(dadosPrincipais, `principal_${timestamp}.csv`, [
            'tenant_id', 'tenant_name', 'period_days', 'start_date', 
            'receita_total', 'agendamentos_total', 'conversas_total'
        ]);

        return dadosPrincipais;
    }

    async gerarCSVReceitaPorFuncionario(tenants, periodos) {
        console.log('👥 Gerando CSV Receita por Funcionário...');
        const dadosFuncionarios = [];

        for (const tenant of tenants) {
            for (const periodo of periodos) {
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - periodo.dias);
                const startDateStr = startDate.toISOString();

                // Appointments completed com funcionário e preço
                const { data: appointments } = await this.supabase
                    .from('appointments')
                    .select(`
                        id,
                        created_at,
                        professional_id,
                        appointment_data,
                        services (
                            name,
                            base_price
                        ),
                        professionals (
                            name
                        )
                    `)
                    .eq('tenant_id', tenant.id)
                    .eq('status', 'completed')
                    .not('services.base_price', 'is', null)
                    .gte('created_at', startDateStr);

                appointments?.forEach(apt => {
                    const funcionarioName = apt.professionals?.name || apt.appointment_data?.professional_name;
                    const receita = parseFloat(apt.services?.base_price) || 0;

                    if (funcionarioName && receita > 0) {
                        dadosFuncionarios.push({
                            tenant_id: tenant.id,
                            tenant_name: tenant.name,
                            period_days: periodo.dias,
                            data_agendamento: apt.created_at.split('T')[0],
                            agendamento_id: apt.id,
                            funcionario_nome: funcionarioName,
                            servico_nome: apt.services?.name || 'N/A',
                            receita: receita
                        });
                    }
                });

                console.log(`   ✅ ${tenant.name} (${periodo.dias}d): ${appointments?.length || 0} appointments`);
            }
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
        this.salvarCSV(dadosFuncionarios, `receita_por_funcionario_${timestamp}.csv`, [
            'tenant_id', 'tenant_name', 'period_days', 'data_agendamento', 
            'agendamento_id', 'funcionario_nome', 'servico_nome', 'receita'
        ]);

        return dadosFuncionarios;
    }

    async gerarCSVReceitaPorServico(tenants, periodos) {
        console.log('🛠️ Gerando CSV Receita por Serviço...');
        const dadosServicos = [];

        for (const tenant of tenants) {
            for (const periodo of periodos) {
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - periodo.dias);
                const startDateStr = startDate.toISOString();

                // Appointments completed com serviço e preço
                const { data: appointments } = await this.supabase
                    .from('appointments')
                    .select(`
                        id,
                        created_at,
                        service_id,
                        services (
                            name,
                            base_price
                        )
                    `)
                    .eq('tenant_id', tenant.id)
                    .eq('status', 'completed')
                    .not('services.base_price', 'is', null)
                    .gte('created_at', startDateStr);

                appointments?.forEach(apt => {
                    const servicoName = apt.services?.name;
                    const receita = parseFloat(apt.services?.base_price) || 0;

                    if (servicoName && receita > 0) {
                        dadosServicos.push({
                            tenant_id: tenant.id,
                            tenant_name: tenant.name,
                            period_days: periodo.dias,
                            data_agendamento: apt.created_at.split('T')[0],
                            agendamento_id: apt.id,
                            servico_id: apt.service_id,
                            servico_nome: servicoName,
                            receita: receita
                        });
                    }
                });

                console.log(`   ✅ ${tenant.name} (${periodo.dias}d): ${appointments?.length || 0} appointments`);
            }
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
        this.salvarCSV(dadosServicos, `receita_por_servico_${timestamp}.csv`, [
            'tenant_id', 'tenant_name', 'period_days', 'data_agendamento', 
            'agendamento_id', 'servico_id', 'servico_nome', 'receita'
        ]);

        return dadosServicos;
    }

    async gerarCSVReceitaPorCliente(tenants, periodos) {
        console.log('👤 Gerando CSV Receita por Cliente...');
        const dadosClientes = [];

        for (const tenant of tenants) {
            for (const periodo of periodos) {
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - periodo.dias);
                const startDateStr = startDate.toISOString();

                // Appointments completed com cliente e preço
                const { data: appointments } = await this.supabase
                    .from('appointments')
                    .select(`
                        id,
                        created_at,
                        user_id,
                        appointment_data,
                        services (
                            name,
                            base_price
                        )
                    `)
                    .eq('tenant_id', tenant.id)
                    .eq('status', 'completed')
                    .not('services.base_price', 'is', null)
                    .not('user_id', 'is', null)
                    .gte('created_at', startDateStr);

                appointments?.forEach(apt => {
                    const clienteId = apt.user_id;
                    const clienteNome = apt.appointment_data?.customer_name || apt.appointment_data?.client_name;
                    const receita = parseFloat(apt.services?.base_price) || 0;

                    if (clienteId && receita > 0) {
                        dadosClientes.push({
                            tenant_id: tenant.id,
                            tenant_name: tenant.name,
                            period_days: periodo.dias,
                            data_agendamento: apt.created_at.split('T')[0],
                            agendamento_id: apt.id,
                            cliente_id: clienteId,
                            cliente_nome: clienteNome || 'N/A',
                            servico_nome: apt.services?.name || 'N/A',
                            receita: receita
                        });
                    }
                });

                console.log(`   ✅ ${tenant.name} (${periodo.dias}d): ${appointments?.length || 0} appointments`);
            }
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
        this.salvarCSV(dadosClientes, `receita_por_cliente_${timestamp}.csv`, [
            'tenant_id', 'tenant_name', 'period_days', 'data_agendamento', 
            'agendamento_id', 'cliente_id', 'cliente_nome', 'servico_nome', 'receita'
        ]);

        return dadosClientes;
    }

    async executar() {
        console.log('🚀 GERADOR DE CSVs MÚLTIPLOS');
        console.log('='.repeat(50));

        const tenants = await this.getTenants();
        const periodos = [
            { nome: '7 dias', dias: 7 },
            { nome: '30 dias', dias: 30 },
            { nome: '90 dias', dias: 90 }
        ];

        console.log(`📋 ${tenants.length} tenants encontrados`);
        console.log(`📅 ${periodos.length} períodos: ${periodos.map(p => p.nome).join(', ')}`);

        try {
            // Gerar os 4 CSVs
            const principal = await this.gerarCSVPrincipal(tenants, periodos);
            const funcionarios = await this.gerarCSVReceitaPorFuncionario(tenants, periodos);
            const servicos = await this.gerarCSVReceitaPorServico(tenants, periodos);
            const clientes = await this.gerarCSVReceitaPorCliente(tenants, periodos);

            console.log('\n🎯 RESUMO FINAL:');
            console.log(`📊 Principal: ${principal.length} registros`);
            console.log(`👥 Funcionários: ${funcionarios.length} registros`);
            console.log(`🛠️ Serviços: ${servicos.length} registros`);
            console.log(`👤 Clientes: ${clientes.length} registros`);

            // Validação básica
            const totalReceita = funcionarios.reduce((sum, item) => sum + item.receita, 0);
            console.log(`💰 Receita total validada: R$ ${this.formatarNumero(totalReceita)}`);

            console.log('\n✅ TODOS OS CSVs GERADOS COM SUCESSO!');
            console.log('📁 Formato: Separador ; (ponto-e-vírgula)');
            console.log('🇧🇷 Números: Formato brasileiro (vírgula decimal)');

            return { principal, funcionarios, servicos, clientes };

        } catch (error) {
            console.error('💥 Erro na geração:', error);
            throw error;
        }
    }
}

// Executar
if (require.main === module) {
    const gerador = new GeradorCSVsMultiplos();
    gerador.executar()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('💥 Erro:', error);
            process.exit(1);
        });
}

module.exports = GeradorCSVsMultiplos;