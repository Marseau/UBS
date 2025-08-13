/**
 * POPULAR DADOS RESTANTES - SERVIÇOS, USUÁRIOS, CONVERSAS E AGENDAMENTOS
 */

const { supabaseAdmin } = require('./dist/config/database.js');
const { v4: uuidv4 } = require('uuid');

async function popularRestante() {
    console.log('🚀 POPULANDO DADOS RESTANTES\n');
    
    const stats = {
        categories: 0,
        services: 0,
        users: 0,
        conversations: 0,
        appointments: 0
    };
    
    try {
        // Buscar tenants e profissionais
        const { data: tenants } = await supabaseAdmin
            .from('tenants')
            .select('*');
        
        console.log(`📋 ${tenants.length} tenants encontrados\n`);
        
        for (const tenant of tenants) {
            console.log(`🏢 ${tenant.name}:`);
            
            // 1. CRIAR CATEGORIA E SERVIÇOS
            const { data: categoria, error: catError } = await supabaseAdmin
                .from('service_categories')
                .insert({
                    id: uuidv4(),
                    tenant_id: tenant.id,
                    name: 'Categoria Principal',
                    is_active: true
                })
                .select()
                .single();
            
            if (catError) {
                console.log(`  ❌ Erro categoria: ${catError.message}`);
                continue;
            }
            
            stats.categories++;
            
            // Criar serviços
            let servicosCriados = 0;
            const servicosIds = [];
            
            for (let i = 1; i <= 8; i++) {
                const service = {
                    id: uuidv4(),
                    tenant_id: tenant.id,
                    category_id: categoria.id,
                    name: `Serviço ${i}`,
                    price: 100 + (i * 20),
                    duration_minutes: 60,
                    is_active: true
                };
                
                const { data: srv, error: srvError } = await supabaseAdmin
                    .from('services')
                    .insert(service)
                    .select()
                    .single();
                
                if (srv) {
                    servicosCriados++;
                    servicosIds.push(srv);
                    stats.services++;
                } else if (srvError) {
                    console.log(`     Erro serviço: ${srvError.message}`);
                }
            }
            console.log(`  ✓ ${servicosCriados} serviços`);
            
            // 2. CRIAR USUÁRIOS
            let usuariosCriados = 0;
            const usuariosIds = [];
            
            for (let i = 1; i <= 20; i++) { // Apenas 20 por tenant para ser mais rápido
                const userId = uuidv4();
                const user = {
                    id: userId,
                    name: `Cliente ${i} ${tenant.name}`,
                    email: `cliente${stats.users + i}@email.com`,
                    phone: `+5511${90000000 + stats.users + i}`
                };
                
                const { data: usr, error: usrError } = await supabaseAdmin
                    .from('users')
                    .insert(user)
                    .select()
                    .single();
                
                if (usr) {
                    // Associar ao tenant
                    const { error: utError } = await supabaseAdmin
                        .from('user_tenants')
                        .insert({
                            user_id: userId,
                            tenant_id: tenant.id
                        });
                    
                    if (!utError) {
                        usuariosCriados++;
                        usuariosIds.push(usr);
                        stats.users++;
                    }
                } else if (usrError) {
                    console.log(`     Erro usuário: ${usrError.message}`);
                }
            }
            console.log(`  ✓ ${usuariosCriados} usuários`);
            
            // 3. CRIAR CONVERSAS
            let conversasCriadas = 0;
            const conversasAgendamento = [];
            
            for (const user of usuariosIds) {
                // 3 conversas por usuário
                for (let i = 0; i < 3; i++) {
                    const foiAgendamento = Math.random() < 0.7;
                    
                    const conversa = {
                        id: uuidv4(),
                        tenant_id: tenant.id,
                        user_id: user.id,
                        message: 'Olá, gostaria de agendar um horário',
                        is_from_user: true,
                        message_type: 'text',
                        confidence_score: 0.95,
                        conversation_outcome: foiAgendamento ? 'appointment_created' : 'info_request_fulfilled'
                    };
                    
                    const { data: conv, error: convError } = await supabaseAdmin
                        .from('conversation_history')
                        .insert(conversa)
                        .select()
                        .single();
                    
                    if (conv) {
                        conversasCriadas++;
                        stats.conversations++;
                        
                        if (foiAgendamento) {
                            conversasAgendamento.push({
                                userId: user.id,
                                conversationId: conv.id
                            });
                        }
                    } else if (convError) {
                        console.log(`     Erro conversa: ${convError.message}`);
                    }
                }
            }
            console.log(`  ✓ ${conversasCriadas} conversas`);
            
            // 4. CRIAR AGENDAMENTOS
            const { data: profissionais } = await supabaseAdmin
                .from('professionals')
                .select('*')
                .eq('tenant_id', tenant.id);
            
            let agendamentosCriados = 0;
            
            if (profissionais && profissionais.length > 0 && servicosIds.length > 0) {
                for (const conv of conversasAgendamento) {
                    const prof = profissionais[Math.floor(Math.random() * profissionais.length)];
                    const serv = servicosIds[Math.floor(Math.random() * servicosIds.length)];
                    
                    const dataAgendamento = new Date();
                    dataAgendamento.setDate(dataAgendamento.getDate() + Math.floor(Math.random() * 7) + 1);
                    dataAgendamento.setHours(9 + Math.floor(Math.random() * 8));
                    dataAgendamento.setMinutes(0);
                    
                    const appointment = {
                        id: uuidv4(),
                        tenant_id: tenant.id,
                        user_id: conv.userId,
                        professional_id: prof.id,
                        service_id: serv.id,
                        appointment_date: dataAgendamento.toISOString(),
                        status: 'confirmed',
                        price: serv.price
                    };
                    
                    const { data: apt, error: aptError } = await supabaseAdmin
                        .from('appointments')
                        .insert(appointment)
                        .select()
                        .single();
                    
                    if (apt) {
                        agendamentosCriados++;
                        stats.appointments++;
                    } else if (aptError) {
                        console.log(`     Erro agendamento: ${aptError.message}`);
                    }
                }
            }
            console.log(`  ✓ ${agendamentosCriados} agendamentos\n`);
        }
        
        // RESUMO
        console.log('='.repeat(50));
        console.log('📊 RESUMO FINAL');
        console.log('='.repeat(50));
        console.log(`✅ Categorias: ${stats.categories}`);
        console.log(`✅ Serviços: ${stats.services}`);
        console.log(`✅ Usuários: ${stats.users}`);
        console.log(`✅ Conversas: ${stats.conversations}`);
        console.log(`✅ Agendamentos: ${stats.appointments}`);
        
    } catch (erro) {
        console.error('❌ Erro geral:', erro);
    }
}

// Executar
popularRestante()
    .then(() => {
        console.log('\n✅ POPULAÇÃO CONCLUÍDA!');
        process.exit(0);
    })
    .catch(erro => {
        console.error('❌ Erro fatal:', erro);
        process.exit(1);
    });