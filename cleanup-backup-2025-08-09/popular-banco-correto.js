/**
 * POPULAÇÃO CORRETA DO BANCO - COM CAMPOS CORRETOS
 */

const { supabaseAdmin } = require('./dist/config/database.js');
const { v4: uuidv4 } = require('uuid');

async function popularBancoCorreto() {
    console.log('🚀 POPULAÇÃO CORRETA DO BANCO\n');
    
    const stats = {
        tenants: 0,
        professionals: 0,
        services: 0,
        users: 0,
        conversations: 0,
        appointments: 0
    };
    
    try {
        // 1. Carregar tenants
        const { data: tenants } = await supabaseAdmin
            .from('tenants')
            .select('*');
        
        stats.tenants = tenants.length;
        console.log(`📋 ${tenants.length} tenants encontrados\n`);
        
        // 2. Para cada tenant, popular dados
        for (const tenant of tenants) {
            console.log(`🏢 ${tenant.name}:`);
            
            // PROFISSIONAIS (sem campo specialization)
            const profissionais = [];
            for (let i = 0; i < 4; i++) {
                const prof = {
                    tenant_id: tenant.id,
                    name: `${getNomeProfissional(tenant.domain, i)}`
                };
                
                const { data } = await supabaseAdmin
                    .from('professionals')
                    .insert(prof)
                    .select()
                    .single();
                
                if (data) {
                    profissionais.push(data);
                    stats.professionals++;
                }
            }
            console.log(`  ✓ ${profissionais.length} profissionais`);
            
            // CATEGORIAS E SERVIÇOS
            const { data: categoria } = await supabaseAdmin
                .from('service_categories')
                .insert({
                    tenant_id: tenant.id,
                    name: getCategoria(tenant.domain),
                    description: `Serviços de ${getCategoria(tenant.domain)}`,
                    is_active: true
                })
                .select()
                .single();
            
            const servicos = [];
            const listaServicos = getServicos(tenant.domain);
            
            for (let i = 0; i < 8; i++) {
                const srv = listaServicos[i % listaServicos.length];
                const service = {
                    tenant_id: tenant.id,
                    category_id: categoria?.id,
                    name: srv.nome,
                    description: `${srv.nome} profissional`,
                    price: srv.preco,
                    duration_minutes: srv.duracao,
                    is_active: true
                };
                
                const { data } = await supabaseAdmin
                    .from('services')
                    .insert(service)
                    .select()
                    .single();
                
                if (data) {
                    servicos.push(data);
                    stats.services++;
                }
            }
            console.log(`  ✓ ${servicos.length} serviços`);
            
            // USUÁRIOS
            const usuarios = [];
            for (let i = 0; i < 80; i++) {
                const userId = uuidv4();
                const nome = getNomeUsuario(i);
                
                const user = {
                    id: userId,
                    name: nome,
                    email: `${nome.toLowerCase().replace(/\s/g, '.')}${stats.users}@email.com`,
                    phone: `+5511${90000000 + stats.users}`
                };
                
                const { data } = await supabaseAdmin
                    .from('users')
                    .insert(user)
                    .select()
                    .single();
                
                if (data) {
                    // Associar ao tenant
                    await supabaseAdmin
                        .from('user_tenants')
                        .insert({
                            user_id: userId,
                            tenant_id: tenant.id
                        });
                    
                    usuarios.push(data);
                    stats.users++;
                }
            }
            console.log(`  ✓ ${usuarios.length} usuários`);
            
            // CONVERSAS (simplificado - 2 por usuário)
            let conversasComAgendamento = 0;
            const conversasIds = [];
            
            for (const user of usuarios.slice(0, 40)) { // Apenas metade dos usuários
                for (let i = 0; i < 2; i++) {
                    const foiAgendamento = Math.random() < 0.7375;
                    
                    const conversa = {
                        id: uuidv4(),
                        tenant_id: tenant.id,
                        user_id: user.id,
                        message: getMensagem(tenant.domain),
                        is_from_user: true,
                        message_type: 'text',
                        confidence_score: 0.95,
                        conversation_outcome: foiAgendamento ? 'appointment_created' : 'info_request_fulfilled'
                    };
                    
                    const { data } = await supabaseAdmin
                        .from('conversation_history')
                        .insert(conversa)
                        .select()
                        .single();
                    
                    if (data) {
                        stats.conversations++;
                        if (foiAgendamento) {
                            conversasComAgendamento++;
                            conversasIds.push({
                                conversaId: data.id,
                                userId: user.id
                            });
                        }
                    }
                }
            }
            console.log(`  ✓ ${usuarios.length * 2} conversas (${conversasComAgendamento} agendamentos)`);
            
            // AGENDAMENTOS
            let agendamentosCriados = 0;
            
            for (const conv of conversasIds) {
                if (profissionais.length > 0 && servicos.length > 0) {
                    const prof = profissionais[Math.floor(Math.random() * profissionais.length)];
                    const serv = servicos[Math.floor(Math.random() * servicos.length)];
                    
                    const dataAgendamento = new Date();
                    dataAgendamento.setDate(dataAgendamento.getDate() + Math.floor(Math.random() * 7) + 1);
                    dataAgendamento.setHours(9 + Math.floor(Math.random() * 8));
                    dataAgendamento.setMinutes(0);
                    
                    const appointment = {
                        tenant_id: tenant.id,
                        user_id: conv.userId,
                        professional_id: prof.id,
                        service_id: serv.id,
                        appointment_date: dataAgendamento.toISOString(),
                        status: 'confirmed',
                        price: serv.price,
                        notes: 'Agendamento via WhatsApp'
                    };
                    
                    const { data } = await supabaseAdmin
                        .from('appointments')
                        .insert(appointment)
                        .select()
                        .single();
                    
                    if (data) {
                        agendamentosCriados++;
                        stats.appointments++;
                        
                        // Aplicar status (10% cancelado, 20% remarcado)
                        const random = Math.random();
                        if (random < 0.1) {
                            await supabaseAdmin
                                .from('appointments')
                                .update({ status: 'cancelled' })
                                .eq('id', data.id);
                        } else if (random < 0.3) {
                            await supabaseAdmin
                                .from('appointments')
                                .update({ status: 'rescheduled' })
                                .eq('id', data.id);
                        }
                    }
                }
            }
            console.log(`  ✓ ${agendamentosCriados} agendamentos\n`);
        }
        
        // RESUMO
        console.log('='.repeat(50));
        console.log('📊 RESUMO FINAL');
        console.log('='.repeat(50));
        console.log(`✅ Tenants: ${stats.tenants}`);
        console.log(`✅ Profissionais: ${stats.professionals}`);
        console.log(`✅ Serviços: ${stats.services}`);
        console.log(`✅ Usuários: ${stats.users}`);
        console.log(`✅ Conversas: ${stats.conversations}`);
        console.log(`✅ Agendamentos: ${stats.appointments}`);
        
    } catch (erro) {
        console.error('❌ Erro:', erro.message);
    }
}

// Funções auxiliares
function getNomeProfissional(domain, index) {
    const nomes = {
        beauty: ['Ana Silva', 'Bruno Santos', 'Carla Lima', 'Daniel Costa'],
        healthcare: ['Dra. Elena Martinez', 'Dr. Fernando Alves', 'Dra. Gabriela', 'Dr. Henrique'],
        legal: ['Dr. Igor Mendes', 'Dra. Julia Ferreira', 'Dr. Lucas', 'Dra. Marina'],
        education: ['Prof. Nathan', 'Prof. Olivia', 'Prof. Pedro', 'Prof. Quinta'],
        sports: ['Rafael Torres', 'Sofia Martins', 'Thiago', 'Ursula']
    };
    return nomes[domain]?.[index] || `Profissional ${index + 1}`;
}

function getCategoria(domain) {
    const categorias = {
        beauty: 'Beleza e Estética',
        healthcare: 'Saúde Mental',
        legal: 'Serviços Jurídicos',
        education: 'Educação',
        sports: 'Fitness'
    };
    return categorias[domain] || 'Serviços Gerais';
}

function getServicos(domain) {
    const servicos = {
        beauty: [
            { nome: 'Corte de Cabelo', preco: 80, duracao: 45 },
            { nome: 'Coloração', preco: 250, duracao: 120 },
            { nome: 'Manicure', preco: 60, duracao: 60 },
            { nome: 'Limpeza de Pele', preco: 120, duracao: 90 }
        ],
        healthcare: [
            { nome: 'Consulta', preco: 200, duracao: 50 },
            { nome: 'Psicoterapia', preco: 180, duracao: 50 },
            { nome: 'Terapia Casal', preco: 300, duracao: 80 },
            { nome: 'Avaliação', preco: 500, duracao: 120 }
        ],
        legal: [
            { nome: 'Consulta Jurídica', preco: 300, duracao: 60 },
            { nome: 'Contrato', preco: 800, duracao: 120 },
            { nome: 'Processo', preco: 2000, duracao: 180 },
            { nome: 'Mediação', preco: 400, duracao: 120 }
        ],
        education: [
            { nome: 'Aula Particular', preco: 80, duracao: 60 },
            { nome: 'Reforço', preco: 70, duracao: 60 },
            { nome: 'ENEM', preco: 100, duracao: 90 },
            { nome: 'Idiomas', preco: 90, duracao: 60 }
        ],
        sports: [
            { nome: 'Personal', preco: 120, duracao: 60 },
            { nome: 'Yoga', preco: 80, duracao: 60 },
            { nome: 'Avaliação', preco: 150, duracao: 90 },
            { nome: 'Pilates', preco: 90, duracao: 60 }
        ]
    };
    return servicos[domain] || servicos.sports;
}

function getNomeUsuario(index) {
    const nomes = ['João', 'Maria', 'Pedro', 'Ana', 'Carlos', 'Julia', 'Lucas', 'Beatriz'];
    const sobrenomes = ['Silva', 'Santos', 'Oliveira', 'Costa', 'Pereira', 'Lima'];
    return `${nomes[index % nomes.length]} ${sobrenomes[index % sobrenomes.length]}`;
}

function getMensagem(domain) {
    const mensagens = {
        beauty: 'Olá! Gostaria de agendar um horário',
        healthcare: 'Preciso marcar uma consulta',
        legal: 'Preciso de orientação jurídica',
        education: 'Procuro aulas particulares',
        sports: 'Quero começar a treinar'
    };
    return mensagens[domain] || 'Gostaria de mais informações';
}

// Executar
popularBancoCorreto()
    .then(() => {
        console.log('\n✅ POPULAÇÃO CONCLUÍDA!');
        process.exit(0);
    })
    .catch(erro => {
        console.error('❌ Erro fatal:', erro);
        process.exit(1);
    });