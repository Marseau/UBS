/**
 * SCRIPT COMPLETO DE MÉTRICAS - VERSÃO CORRIGIDA
 * Estrutura real: services.price pode ser null, professional_name em appointment_data
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

class MetricasCompletasCSVCorrigido {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );
    }

    async getTenants() {
        const { data, error } = await this.supabase
            .from('tenants')
            .select('id, name, status, subscription_plan, created_at');
        
        if (error) throw error;
        return data;
    }

    async getReceita(tenantId, startDate = null) {
        // Receita vem do relacionamento appointments -> services
        let query = this.supabase
            .from('appointments')
            .select(`
                appointment_data,
                services (
                    price
                )
            `)
            .eq('tenant_id', tenantId)
            .eq('status', 'completed');

        if (startDate) {
            query = query.gte('created_at', startDate);
        }

        const { data, error } = await query;
        if (error) throw error;

        let receita = 0;
        data?.forEach(apt => {
            // Prioridade: services.price -> appointment_data.price -> 0
            const price = apt.services?.price || apt.appointment_data?.price || 0;
            receita += parseFloat(price) || 0;
        });

        return receita;
    }

    async getReceitaPorServico(tenantId, startDate = null) {
        let query = this.supabase
            .from('appointments')
            .select(`
                service_id,
                services (
                    name,
                    price
                )
            `)
            .eq('tenant_id', tenantId)
            .eq('status', 'completed');

        if (startDate) {
            query = query.gte('created_at', startDate);
        }

        const { data } = await query;
        const servicoReceita = {};

        data?.forEach(apt => {
            const serviceName = apt.services?.name || 'Serviço Sem Nome';
            const price = parseFloat(apt.services?.price) || 0;
            servicoReceita[serviceName] = (servicoReceita[serviceName] || 0) + price;
        });

        return Object.keys(servicoReceita).length; // Quantidade de serviços únicos
    }

    async getReceitaPorFuncionario(tenantId, startDate = null) {
        let query = this.supabase
            .from('appointments')
            .select(`
                appointment_data,
                services (
                    price
                )
            `)
            .eq('tenant_id', tenantId)
            .eq('status', 'completed');

        if (startDate) {
            query = query.gte('created_at', startDate);
        }

        const { data } = await query;
        const funcionarioReceita = {};

        data?.forEach(apt => {
            const funcionario = apt.appointment_data?.professional_name || 'Funcionário Não Informado';
            const price = parseFloat(apt.services?.price) || 0;
            funcionarioReceita[funcionario] = (funcionarioReceita[funcionario] || 0) + price;
        });

        return Object.keys(funcionarioReceita).length; // Quantidade de funcionários únicos
    }

    async getReceitaPorCliente(tenantId, startDate = null) {
        let query = this.supabase
            .from('appointments')
            .select(`
                user_id,
                services (
                    price
                )
            `)
            .eq('tenant_id', tenantId)
            .eq('status', 'completed');

        if (startDate) {
            query = query.gte('created_at', startDate);
        }

        const { data } = await query;
        const clienteReceita = {};

        data?.forEach(apt => {
            const userId = apt.user_id || 'Cliente Não Informado';
            const price = parseFloat(apt.services?.price) || 0;
            clienteReceita[userId] = (clienteReceita[userId] || 0) + price;
        });

        return Object.keys(clienteReceita).length; // Quantidade de clientes únicos
    }

    async getConversasTotal(tenantId, startDate = null) {
        let query = this.supabase
            .from('conversation_history')
            .select('conversation_context')
            .eq('tenant_id', tenantId);

        if (startDate) {
            query = query.gte('created_at', startDate);
        }

        const { data } = await query;
        
        const sessionsUnicas = new Set();
        data?.forEach(msg => {
            const sessionId = msg.conversation_context?.session_id;
            if (sessionId) {
                sessionsUnicas.add(sessionId);
            }
        });

        return sessionsUnicas.size;
    }

    async getConversasMinutosTotal(tenantId, startDate = null) {
        let query = this.supabase
            .from('conversation_history')
            .select('conversation_context, created_at')
            .eq('tenant_id', tenantId)
            .order('created_at');

        if (startDate) {
            query = query.gte('created_at', startDate);
        }

        const { data } = await query;
        
        const sessoes = {};
        data?.forEach(msg => {
            const sessionId = msg.conversation_context?.session_id;
            if (sessionId) {
                if (!sessoes[sessionId]) {
                    sessoes[sessionId] = { inicio: msg.created_at, fim: msg.created_at };
                } else {
                    sessoes[sessionId].fim = msg.created_at;
                }
            }
        });

        let totalMinutos = 0;
        Object.values(sessoes).forEach(sessao => {
            const inicio = new Date(sessao.inicio);
            const fim = new Date(sessao.fim);
            const minutos = (fim - inicio) / (1000 * 60);
            totalMinutos += minutos;
        });

        return Math.round(totalMinutos * 100) / 100;
    }

    async getConversasPorOutcome(tenantId, startDate = null) {
        let query = this.supabase
            .from('conversation_history')
            .select('conversation_outcome')
            .eq('tenant_id', tenantId);

        if (startDate) {
            query = query.gte('created_at', startDate);
        }

        const { data } = await query;
        
        const outcomes = {};
        data?.forEach(msg => {
            const outcome = msg.conversation_outcome || 'sem_outcome';
            outcomes[outcome] = (outcomes[outcome] || 0) + 1;
        });

        return Object.keys(outcomes).length;
    }

    async getAgendamentosTotal(tenantId, startDate = null) {
        let query = this.supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId);

        if (startDate) {
            query = query.gte('created_at', startDate);
        }

        const { count } = await query;
        return count || 0;
    }

    async getAgendamentosPorStatus(tenantId, startDate = null) {
        let query = this.supabase
            .from('appointments')
            .select('status')
            .eq('tenant_id', tenantId);

        if (startDate) {
            query = query.gte('created_at', startDate);
        }

        const { data } = await query;
        
        const statusCount = {};
        data?.forEach(apt => {
            const status = apt.status || 'sem_status';
            statusCount[status] = (statusCount[status] || 0) + 1;
        });

        return Object.keys(statusCount).length;
    }

    async getMensagensTotal(tenantId, startDate = null) {
        let query = this.supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId);

        if (startDate) {
            query = query.gte('created_at', startDate);
        }

        const { count } = await query;
        return count || 0;
    }

    async getMensagensConfidenceScore(tenantId, startDate = null) {
        let query = this.supabase
            .from('conversation_history')
            .select('confidence_score')
            .eq('tenant_id', tenantId)
            .not('confidence_score', 'is', null);

        if (startDate) {
            query = query.gte('created_at', startDate);
        }

        const { data } = await query;
        
        let totalScore = 0;
        let count = 0;
        data?.forEach(msg => {
            if (msg.confidence_score) {
                totalScore += parseFloat(msg.confidence_score);
                count++;
            }
        });

        return count > 0 ? Math.round((totalScore / count) * 100) / 100 : 0;
    }

    async calcularMetricasTenant(tenant, days) {
        console.log(`📊 Calculando ${tenant.name} (${days} dias)...`);
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startDateStr = startDate.toISOString();

        const metricas = {
            tenant_id: tenant.id,
            tenant_name: tenant.name,
            period_days: days,
            start_date: startDateStr.split('T')[0],
            
            receita: await this.getReceita(tenant.id, startDateStr),
            receita_por_servico: await this.getReceitaPorServico(tenant.id, startDateStr),
            receita_por_funcionario: await this.getReceitaPorFuncionario(tenant.id, startDateStr),
            receita_por_cliente: await this.getReceitaPorCliente(tenant.id, startDateStr),
            
            conversas_total: await this.getConversasTotal(tenant.id, startDateStr),
            conversas_minutos_total: await this.getConversasMinutosTotal(tenant.id, startDateStr),
            conversas_total_por_outcome: await this.getConversasPorOutcome(tenant.id, startDateStr),
            
            agendamentos_total: await this.getAgendamentosTotal(tenant.id, startDateStr),
            agendamentos_total_por_status: await this.getAgendamentosPorStatus(tenant.id, startDateStr),
            
            mensagens_total: await this.getMensagensTotal(tenant.id, startDateStr),
            mensagens_confidence_score: await this.getMensagensConfidenceScore(tenant.id, startDateStr)
        };

        // Validação básica
        if (metricas.agendamentos_total > 0 && metricas.conversas_total === 0) {
            console.log(`   ⚠️ Warning: ${metricas.agendamentos_total} agendamentos mas 0 conversas`);
        }

        console.log(`   ✅ ${metricas.agendamentos_total} agendamentos, ${metricas.conversas_total} conversas, ${metricas.mensagens_total} mensagens`);

        return metricas;
    }

    async calcularMetricasPlataforma(tenants) {
        console.log('🌐 Calculando métricas da plataforma...');
        
        // Receita total da plataforma
        let receitaTotal = 0;
        for (const tenant of tenants) {
            const receita = await this.getReceita(tenant.id);
            receitaTotal += receita;
        }

        const plataforma = {
            receita_total_plataforma: receitaTotal,
            tenants_total: tenants.length,
            tenants_ativos: tenants.filter(t => t.status === 'active').length,
            tenants_inativos: tenants.filter(t => t.status !== 'active').length
        };

        // Tenants por plano
        const planos = {};
        tenants.forEach(t => {
            const plano = t.subscription_plan || 'sem_plano';
            planos[plano] = (planos[plano] || 0) + 1;
        });
        plataforma.tenants_total_por_plano = Object.keys(planos).length;

        return plataforma;
    }

    gerarCSV(dados, nomeArquivo) {
        if (dados.length === 0) return;

        const cabecalhos = Object.keys(dados[0]);
        let csv = cabecalhos.join(',') + '\n';

        dados.forEach(linha => {
            const valores = cabecalhos.map(cabecalho => {
                let valor = linha[cabecalho];
                if (typeof valor === 'string' && valor.includes(',')) {
                    valor = `"${valor}"`;
                }
                return valor;
            });
            csv += valores.join(',') + '\n';
        });

        fs.writeFileSync(nomeArquivo, csv);
        console.log(`💾 CSV salvo: ${nomeArquivo}`);
    }

    async executar() {
        console.log('🚀 INICIANDO CÁLCULO COMPLETO DE MÉTRICAS - VERSÃO CORRIGIDA');
        console.log('='.repeat(70));

        const tenants = await this.getTenants();
        const todasMetricas = [];

        // Calcular por tenant para cada período
        for (const days of [7, 30, 90]) {
            console.log(`\n📅 PERÍODO: ${days} DIAS`);
            console.log('-'.repeat(40));

            for (const tenant of tenants) {
                try {
                    const metricas = await this.calcularMetricasTenant(tenant, days);
                    todasMetricas.push(metricas);
                } catch (error) {
                    console.error(`❌ Erro ${tenant.name}:`, error.message);
                }
            }
        }

        // Salvar métricas dos tenants
        this.gerarCSV(todasMetricas, 'metricas_tenants_completas_corrigido.csv');

        // Calcular métricas da plataforma
        const metricasPlataforma = await this.calcularMetricasPlataforma(tenants);
        
        // Salvar métricas da plataforma
        this.gerarCSV([metricasPlataforma], 'metricas_plataforma_completas_corrigido.csv');

        // Resumo final
        console.log('\n📊 RESUMO FINAL:');
        const resumo90d = todasMetricas.filter(m => m.period_days === 90);
        const totalAgendamentos = resumo90d.reduce((sum, m) => sum + m.agendamentos_total, 0);
        const totalConversas = resumo90d.reduce((sum, m) => sum + m.conversas_total, 0);
        const totalMensagens = resumo90d.reduce((sum, m) => sum + m.mensagens_total, 0);

        console.log(`Total 90 dias: ${totalAgendamentos} agendamentos, ${totalConversas} conversas, ${totalMensagens} mensagens`);

        console.log('\n🎯 CÁLCULO CONCLUÍDO!');
        console.log('📄 Arquivos gerados:');
        console.log('   - metricas_tenants_completas_corrigido.csv');
        console.log('   - metricas_plataforma_completas_corrigido.csv');

        return {
            tenants: todasMetricas,
            plataforma: metricasPlataforma
        };
    }
}

// Executar
if (require.main === module) {
    const calculadora = new MetricasCompletasCSVCorrigido();
    calculadora.executar()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('💥 Erro:', error);
            process.exit(1);
        });
}

module.exports = MetricasCompletasCSVCorrigido;