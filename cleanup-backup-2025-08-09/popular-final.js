/**
 * POPULAÇÃO FINAL - APENAS CAMPOS QUE EXISTEM
 */

const { supabaseAdmin } = require('./dist/config/database.js');
const { v4: uuidv4 } = require('uuid');

async function popularFinal() {
    console.log('🚀 POPULAÇÃO FINAL DO BANCO\n');
    
    const stats = {
        categories: 0,
        services: 0,
        users: 0,
        conversations: 0,
        appointments: 0
    };
    
    try {
        const { data: tenants } = await supabaseAdmin
            .from('tenants')
            .select('*');
        
        console.log(`📋 ${tenants.length} tenants encontrados\n`);
        
        for (const tenant of tenants) {
            console.log(`🏢 ${tenant.name}:`);
            
            // 1. CATEGORIA (sem is_active)
            const { data: categoria } = await supabaseAdmin
                .from('service_categories')
                .insert({
                    tenant_id: tenant.id,
                    name: 'Serviços Principais'
                })
                .select()
                .single();
            
            if (categoria) {
                stats.categories++;
                
                // 2. SERVIÇOS (sem is_active)
                let servicosCriados = 0;
                const servicosIds = [];
                
                for (let i = 1; i <= 4; i++) {
                    const { data: srv } = await supabaseAdmin
                        .from('services')
                        .insert({
                            tenant_id: tenant.id,
                            category_id: categoria.id,
                            name: `Serviço ${i}`,
                            price: 100 * i,
                            duration_minutes: 60
                        })
                        .select()
                        .single();
                    
                    if (srv) {
                        servicosCriados++;
                        servicosIds.push(srv);
                        stats.services++;
                    }
                }
                console.log(`  ✓ ${servicosCriados} serviços`);
            }
            
            // 3. USUÁRIOS
            let usuariosCriados = 0;
            const usuariosIds = [];
            
            for (let i = 1; i <= 10; i++) {
                const userId = uuidv4();
                const { data: usr } = await supabaseAdmin
                    .from('users')
                    .insert({
                        id: userId,
                        name: `Cliente ${i}`,
                        email: `cliente${stats.users + i}@test.com`,
                        phone: `+5511${98000000 + stats.users + i}`
                    })
                    .select()
                    .single();
                
                if (usr) {
                    await supabaseAdmin
                        .from('user_tenants')
                        .insert({
                            user_id: userId,
                            tenant_id: tenant.id
                        });
                    
                    usuariosCriados++;
                    usuariosIds.push(usr);
                    stats.users++;
                }
            }
            console.log(`  ✓ ${usuariosCriados} usuários`);
            
            // 4. CONVERSAS
            let conversasCriadas = 0;
            const conversasAgendamento = [];
            
            for (const user of usuariosIds) {
                const foiAgendamento = Math.random() < 0.7;
                
                const { data: conv } = await supabaseAdmin
                    .from('conversation_history')
                    .insert({
                        tenant_id: tenant.id,
                        user_id: user.id,
                        message: 'Olá, gostaria de agendar',
                        is_from_user: true,
                        message_type: 'text',
                        confidence_score: 0.95,
                        conversation_outcome: foiAgendamento ? 'appointment_created' : 'info_request_fulfilled'
                    })
                    .select()
                    .single();
                
                if (conv) {
                    conversasCriadas++;
                    stats.conversations++;
                    
                    if (foiAgendamento) {
                        conversasAgendamento.push(user.id);
                    }
                }
            }
            console.log(`  ✓ ${conversasCriadas} conversas`);
            
            // 5. AGENDAMENTOS
            const { data: profissionais } = await supabaseAdmin
                .from('professionals')
                .select('*')
                .eq('tenant_id', tenant.id);
            
            const { data: servicos } = await supabaseAdmin
                .from('services')
                .select('*')
                .eq('tenant_id', tenant.id);
            
            let agendamentosCriados = 0;
            
            if (profissionais?.length > 0 && servicos?.length > 0) {
                for (const userId of conversasAgendamento) {
                    const prof = profissionais[0];
                    const serv = servicos[0];
                    
                    const dataAgendamento = new Date();
                    dataAgendamento.setDate(dataAgendamento.getDate() + 3);
                    
                    const { data: apt } = await supabaseAdmin
                        .from('appointments')
                        .insert({
                            tenant_id: tenant.id,
                            user_id: userId,
                            professional_id: prof.id,
                            service_id: serv.id,
                            appointment_date: dataAgendamento.toISOString(),
                            status: 'confirmed',
                            price: serv.price
                        })
                        .select()
                        .single();
                    
                    if (apt) {
                        agendamentosCriados++;
                        stats.appointments++;
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
        
        // Verificar totais no banco
        console.log('\n📊 TOTAIS NO BANCO:');
        
        const { count: totalTenants } = await supabaseAdmin
            .from('tenants')
            .select('*', { count: 'exact', head: true });
        
        const { count: totalProfessionals } = await supabaseAdmin
            .from('professionals')
            .select('*', { count: 'exact', head: true });
        
        const { count: totalServices } = await supabaseAdmin
            .from('services')
            .select('*', { count: 'exact', head: true });
        
        const { count: totalUsers } = await supabaseAdmin
            .from('users')
            .select('*', { count: 'exact', head: true });
        
        const { count: totalConversations } = await supabaseAdmin
            .from('conversation_history')
            .select('*', { count: 'exact', head: true });
        
        const { count: totalAppointments } = await supabaseAdmin
            .from('appointments')
            .select('*', { count: 'exact', head: true });
        
        console.log(`  Tenants: ${totalTenants}`);
        console.log(`  Profissionais: ${totalProfessionals}`);
        console.log(`  Serviços: ${totalServices}`);
        console.log(`  Usuários: ${totalUsers}`);
        console.log(`  Conversas: ${totalConversations}`);
        console.log(`  Agendamentos: ${totalAppointments}`);
        
    } catch (erro) {
        console.error('❌ Erro:', erro.message);
    }
}

// Executar
popularFinal()
    .then(() => {
        console.log('\n✅ BANCO POPULADO COM SUCESSO!');
        process.exit(0);
    })
    .catch(erro => {
        console.error('❌ Erro fatal:', erro);
        process.exit(1);
    });