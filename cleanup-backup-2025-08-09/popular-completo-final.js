/**
 * POPULAÇÃO COMPLETA FINAL - COM ESTRUTURA CORRETA
 */

const { supabaseAdmin } = require('./dist/config/database.js');
const { v4: uuidv4 } = require('uuid');

async function popularCompletoFinal() {
    console.log('🚀 POPULAÇÃO COMPLETA FINAL DO BANCO\n');
    
    const stats = {
        services: 0,
        conversations: 0,
        appointments: 0
    };
    
    try {
        // 1. Buscar dados existentes
        const { data: tenants } = await supabaseAdmin
            .from('tenants')
            .select('*');
        
        const { data: categories } = await supabaseAdmin
            .from('service_categories')
            .select('*');
        
        const { data: professionals } = await supabaseAdmin
            .from('professionals')
            .select('*');
        
        const { data: userTenants } = await supabaseAdmin
            .from('user_tenants')
            .select('*');
        
        console.log('📊 DADOS EXISTENTES:');
        console.log(`  Tenants: ${tenants.length}`);
        console.log(`  Categorias: ${categories.length}`);
        console.log(`  Profissionais: ${professionals.length}`);
        console.log(`  User-Tenants: ${userTenants.length}\n`);
        
        // 2. CRIAR SERVIÇOS (estrutura correta)
        console.log('🛠️ CRIANDO SERVIÇOS...');
        
        for (const tenant of tenants) {
            const categoria = categories.find(c => c.tenant_id === tenant.id);
            if (!categoria) continue;
            
            const servicos = getServicos(tenant.domain);
            
            for (let i = 0; i < servicos.length && i < 8; i++) {
                const srv = servicos[i];
                
                const { data, error } = await supabaseAdmin
                    .from('services')
                    .insert({
                        tenant_id: tenant.id,
                        category_id: categoria.id,
                        name: srv.nome,
                        duration_minutes: srv.duracao || 60
                    })
                    .select()
                    .single();
                
                if (data) {
                    stats.services++;
                } else if (error) {
                    console.log(`  ❌ Erro serviço ${srv.nome}: ${error.message}`);
                }
            }
        }
        console.log(`✅ ${stats.services} serviços criados\n`);
        
        // 3. CRIAR CONVERSAS
        console.log('💬 CRIANDO CONVERSAS...');
        const conversasParaAgendamento = [];
        
        for (const tenant of tenants) {
            const usuariosTenant = userTenants
                .filter(ut => ut.tenant_id === tenant.id)
                .slice(0, 10); // 10 usuários por tenant
            
            for (const ut of usuariosTenant) {
                // 3 conversas por usuário
                for (let i = 0; i < 3; i++) {
                    const foiAgendamento = Math.random() < 0.7375;
                    
                    const conversa = {
                        tenant_id: tenant.id,
                        user_id: ut.user_id,
                        message: getMensagem(tenant.domain, i),
                        is_from_user: true,
                        message_type: 'text',
                        confidence_score: 0.95 + (Math.random() * 0.05),
                        conversation_outcome: foiAgendamento ? 'appointment_created' : 'info_request_fulfilled'
                    };
                    
                    const { data, error } = await supabaseAdmin
                        .from('conversation_history')
                        .insert(conversa)
                        .select()
                        .single();
                    
                    if (data) {
                        stats.conversations++;
                        
                        if (foiAgendamento) {
                            conversasParaAgendamento.push({
                                tenantId: tenant.id,
                                userId: ut.user_id,
                                conversationId: data.id
                            });
                        }
                        
                        // Adicionar resposta da IA
                        const resposta = {
                            tenant_id: tenant.id,
                            user_id: ut.user_id,
                            message: foiAgendamento 
                                ? 'Claro! Vou verificar os horários disponíveis para você.' 
                                : 'Obrigado pelo contato! Aqui estão as informações solicitadas.',
                            is_from_user: false,
                            message_type: 'text',
                            confidence_score: 0.98
                        };
                        
                        await supabaseAdmin
                            .from('conversation_history')
                            .insert(resposta);
                        
                        stats.conversations++;
                    } else if (error) {
                        console.log(`  ❌ Erro conversa: ${error.message}`);
                    }
                }
            }
        }
        console.log(`✅ ${stats.conversations} mensagens criadas\n`);
        
        // 4. CRIAR AGENDAMENTOS
        console.log('📅 CRIANDO AGENDAMENTOS...');
        
        // Buscar serviços criados
        const { data: services } = await supabaseAdmin
            .from('services')
            .select('*');
        
        for (const conv of conversasParaAgendamento) {
            const profsTenant = professionals.filter(p => p.tenant_id === conv.tenantId);
            const servsTenant = services.filter(s => s.tenant_id === conv.tenantId);
            
            if (profsTenant.length > 0 && servsTenant.length > 0) {
                const prof = profsTenant[Math.floor(Math.random() * profsTenant.length)];
                const serv = servsTenant[Math.floor(Math.random() * servsTenant.length)];
                
                const dataAgendamento = new Date();
                dataAgendamento.setDate(dataAgendamento.getDate() + Math.floor(Math.random() * 7) + 1);
                dataAgendamento.setHours(9 + Math.floor(Math.random() * 8));
                dataAgendamento.setMinutes([0, 30][Math.floor(Math.random() * 2)]);
                
                const appointment = {
                    tenant_id: conv.tenantId,
                    user_id: conv.userId,
                    professional_id: prof.id,
                    service_id: serv.id,
                    appointment_date: dataAgendamento.toISOString(),
                    status: 'confirmed'
                };
                
                const { data, error } = await supabaseAdmin
                    .from('appointments')
                    .insert(appointment)
                    .select()
                    .single();
                
                if (data) {
                    stats.appointments++;
                    
                    // Aplicar status (10.14% cancelado, 20% remarcado)
                    const random = Math.random();
                    if (random < 0.1014) {
                        await supabaseAdmin
                            .from('appointments')
                            .update({ status: 'cancelled' })
                            .eq('id', data.id);
                    } else if (random < 0.3014) {
                        const novaData = new Date(dataAgendamento);
                        novaData.setDate(novaData.getDate() + Math.floor(Math.random() * 7) + 1);
                        
                        await supabaseAdmin
                            .from('appointments')
                            .update({ 
                                status: 'rescheduled',
                                appointment_date: novaData.toISOString()
                            })
                            .eq('id', data.id);
                    }
                } else if (error) {
                    console.log(`  ❌ Erro agendamento: ${error.message}`);
                }
            }
        }
        console.log(`✅ ${stats.appointments} agendamentos criados\n`);
        
        // RESUMO FINAL
        console.log('='.repeat(60));
        console.log('📊 RESUMO FINAL - TOTAIS NO BANCO:');
        console.log('='.repeat(60));
        
        const tabelas = [
            'tenants',
            'professionals',
            'service_categories',
            'services',
            'users',
            'user_tenants',
            'conversation_history',
            'appointments'
        ];
        
        for (const tabela of tabelas) {
            const { count } = await supabaseAdmin
                .from(tabela)
                .select('*', { count: 'exact', head: true });
            console.log(`  ${tabela}: ${count || 0}`);
        }
        
        // Métricas adicionais
        console.log('\n📊 MÉTRICAS:');
        
        const { data: conversasAgendamento } = await supabaseAdmin
            .from('conversation_history')
            .select('*', { count: 'exact' })
            .eq('conversation_outcome', 'appointment_created')
            .eq('is_from_user', true);
        
        const { count: totalConversas } = await supabaseAdmin
            .from('conversation_history')
            .select('*', { count: 'exact', head: true })
            .eq('is_from_user', true);
        
        const { data: agendamentos } = await supabaseAdmin
            .from('appointments')
            .select('status');
        
        const cancelados = agendamentos?.filter(a => a.status === 'cancelled').length || 0;
        const remarcados = agendamentos?.filter(a => a.status === 'rescheduled').length || 0;
        const confirmados = agendamentos?.filter(a => a.status === 'confirmed').length || 0;
        
        console.log(`  Taxa de conversão: ${((conversasAgendamento?.length || 0) / (totalConversas || 1) * 100).toFixed(2)}%`);
        console.log(`  Agendamentos confirmados: ${confirmados}`);
        console.log(`  Agendamentos cancelados: ${cancelados} (${(cancelados / (agendamentos?.length || 1) * 100).toFixed(2)}%)`);
        console.log(`  Agendamentos remarcados: ${remarcados} (${(remarcados / (agendamentos?.length || 1) * 100).toFixed(2)}%)`);
        
    } catch (erro) {
        console.error('❌ Erro:', erro.message);
    }
}

// Funções auxiliares
function getServicos(domain) {
    const servicos = {
        beauty: [
            { nome: 'Corte de Cabelo', duracao: 45 },
            { nome: 'Coloração', duracao: 120 },
            { nome: 'Manicure e Pedicure', duracao: 60 },
            { nome: 'Limpeza de Pele', duracao: 90 },
            { nome: 'Maquiagem', duracao: 60 },
            { nome: 'Design de Sobrancelhas', duracao: 30 },
            { nome: 'Hidratação Capilar', duracao: 60 },
            { nome: 'Massagem Relaxante', duracao: 60 }
        ],
        healthcare: [
            { nome: 'Consulta Psicológica', duracao: 50 },
            { nome: 'Psicoterapia Individual', duracao: 50 },
            { nome: 'Terapia de Casal', duracao: 80 },
            { nome: 'Avaliação Neuropsicológica', duracao: 120 },
            { nome: 'Orientação Vocacional', duracao: 60 },
            { nome: 'Terapia em Grupo', duracao: 90 },
            { nome: 'Consulta Psiquiátrica', duracao: 40 },
            { nome: 'Acompanhamento Terapêutico', duracao: 60 }
        ],
        legal: [
            { nome: 'Consulta Jurídica', duracao: 60 },
            { nome: 'Elaboração de Contrato', duracao: 120 },
            { nome: 'Defesa Trabalhista', duracao: 180 },
            { nome: 'Ação Civil', duracao: 120 },
            { nome: 'Consultoria Empresarial', duracao: 90 },
            { nome: 'Mediação e Conciliação', duracao: 120 },
            { nome: 'Análise de Documentos', duracao: 60 },
            { nome: 'Acompanhamento Processual', duracao: 30 }
        ],
        education: [
            { nome: 'Aula Particular', duracao: 60 },
            { nome: 'Reforço Escolar', duracao: 60 },
            { nome: 'Preparação ENEM', duracao: 90 },
            { nome: 'Curso de Idiomas', duracao: 60 },
            { nome: 'Orientação de TCC', duracao: 120 },
            { nome: 'Aula em Grupo', duracao: 90 },
            { nome: 'Monitoria Online', duracao: 60 },
            { nome: 'Workshop Temático', duracao: 180 }
        ],
        sports: [
            { nome: 'Personal Training', duracao: 60 },
            { nome: 'Aula de Yoga', duracao: 60 },
            { nome: 'Avaliação Física', duracao: 90 },
            { nome: 'Consultoria Nutricional', duracao: 60 },
            { nome: 'Fisioterapia Esportiva', duracao: 50 },
            { nome: 'Treino Funcional', duracao: 60 },
            { nome: 'Pilates', duracao: 60 },
            { nome: 'Massagem Desportiva', duracao: 60 }
        ]
    };
    return servicos[domain] || servicos.sports;
}

function getMensagem(domain, index) {
    const mensagens = {
        beauty: [
            'Olá! Gostaria de agendar um horário para corte de cabelo',
            'Boa tarde! Vocês têm horário disponível para coloração?',
            'Preciso fazer as unhas, tem vaga hoje?'
        ],
        healthcare: [
            'Olá, preciso marcar uma consulta psicológica',
            'Boa tarde, gostaria de iniciar terapia',
            'Estou passando por um momento difícil e preciso de ajuda'
        ],
        legal: [
            'Preciso de orientação sobre direitos trabalhistas',
            'Gostaria de uma consulta para elaborar um contrato',
            'Tenho uma questão jurídica urgente'
        ],
        education: [
            'Meu filho precisa de reforço em matemática',
            'Procuro professor particular de inglês',
            'Vocês têm preparação para o ENEM?'
        ],
        sports: [
            'Quero começar a treinar, como funciona?',
            'Preciso de um personal trainer',
            'Vocês têm aulas de yoga?'
        ]
    };
    const msgs = mensagens[domain] || mensagens.sports;
    return msgs[index % msgs.length];
}

// Executar
popularCompletoFinal()
    .then(() => {
        console.log('\n✅ POPULAÇÃO COMPLETA FINALIZADA!');
        process.exit(0);
    })
    .catch(erro => {
        console.error('❌ Erro fatal:', erro);
        process.exit(1);
    });