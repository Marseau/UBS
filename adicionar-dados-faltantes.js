/**
 * ADICIONAR DADOS FALTANTES - SERVIÇOS, CONVERSAS E AGENDAMENTOS
 */

const { supabaseAdmin } = require('./dist/config/database.js');
const { v4: uuidv4 } = require('uuid');

async function adicionarDadosFaltantes() {
    console.log('🚀 ADICIONANDO DADOS FALTANTES\n');
    
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
        
        // 2. ADICIONAR SERVIÇOS
        console.log('🛠️ ADICIONANDO SERVIÇOS...');
        let servicosAdicionados = 0;
        
        for (const categoria of categories) {
            const tenant = tenants.find(t => t.id === categoria.tenant_id);
            if (!tenant) continue;
            
            for (let i = 1; i <= 4; i++) {
                const { data } = await supabaseAdmin
                    .from('services')
                    .insert({
                        tenant_id: categoria.tenant_id,
                        category_id: categoria.id,
                        name: `${getServiceName(tenant.domain, i)}`,
                        price: 100 + (i * 50),
                        duration_minutes: 60
                    })
                    .select()
                    .single();
                
                if (data) servicosAdicionados++;
            }
        }
        console.log(`✅ ${servicosAdicionados} serviços adicionados\n`);
        
        // 3. ADICIONAR CONVERSAS
        console.log('💬 ADICIONANDO CONVERSAS...');
        let conversasAdicionadas = 0;
        const conversasParaAgendamento = [];
        
        // Pegar apenas 5 usuários por tenant
        for (const tenant of tenants) {
            const usuariosTenant = userTenants
                .filter(ut => ut.tenant_id === tenant.id)
                .slice(0, 5);
            
            for (const ut of usuariosTenant) {
                // 2 conversas por usuário
                for (let i = 0; i < 2; i++) {
                    const foiAgendamento = Math.random() < 0.7;
                    
                    const { data } = await supabaseAdmin
                        .from('conversation_history')
                        .insert({
                            tenant_id: tenant.id,
                            user_id: ut.user_id,
                            message: getConversationMessage(tenant.domain),
                            is_from_user: true,
                            message_type: 'text',
                            confidence_score: 0.95,
                            conversation_outcome: foiAgendamento ? 'appointment_created' : 'info_request_fulfilled'
                        })
                        .select()
                        .single();
                    
                    if (data) {
                        conversasAdicionadas++;
                        
                        if (foiAgendamento) {
                            conversasParaAgendamento.push({
                                tenantId: tenant.id,
                                userId: ut.user_id,
                                conversationId: data.id
                            });
                        }
                    }
                }
            }
        }
        console.log(`✅ ${conversasAdicionadas} conversas adicionadas\n`);
        
        // 4. ADICIONAR AGENDAMENTOS
        console.log('📅 ADICIONANDO AGENDAMENTOS...');
        let agendamentosAdicionados = 0;
        
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
                dataAgendamento.setMinutes(0);
                
                const { data } = await supabaseAdmin
                    .from('appointments')
                    .insert({
                        tenant_id: conv.tenantId,
                        user_id: conv.userId,
                        professional_id: prof.id,
                        service_id: serv.id,
                        appointment_date: dataAgendamento.toISOString(),
                        status: 'confirmed',
                        price: serv.price
                    })
                    .select()
                    .single();
                
                if (data) {
                    agendamentosAdicionados++;
                    
                    // 10% cancelado, 20% remarcado
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
        console.log(`✅ ${agendamentosAdicionados} agendamentos adicionados\n`);
        
        // RESUMO FINAL
        console.log('='.repeat(50));
        console.log('📊 RESUMO FINAL - TOTAIS NO BANCO:');
        console.log('='.repeat(50));
        
        const tabelas = [
            'tenants',
            'professionals',
            'service_categories',
            'services',
            'users',
            'conversation_history',
            'appointments'
        ];
        
        for (const tabela of tabelas) {
            const { count } = await supabaseAdmin
                .from(tabela)
                .select('*', { count: 'exact', head: true });
            console.log(`  ${tabela}: ${count || 0}`);
        }
        
    } catch (erro) {
        console.error('❌ Erro:', erro.message);
    }
}

// Funções auxiliares
function getServiceName(domain, index) {
    const services = {
        beauty: ['Corte de Cabelo', 'Coloração', 'Manicure', 'Limpeza de Pele'],
        healthcare: ['Consulta', 'Psicoterapia', 'Avaliação', 'Terapia em Grupo'],
        legal: ['Consulta Jurídica', 'Elaboração de Contrato', 'Mediação', 'Análise'],
        education: ['Aula Particular', 'Reforço Escolar', 'Preparação ENEM', 'Monitoria'],
        sports: ['Personal Training', 'Aula de Yoga', 'Avaliação Física', 'Pilates']
    };
    return services[domain]?.[index - 1] || `Serviço ${index}`;
}

function getConversationMessage(domain) {
    const messages = {
        beauty: 'Olá! Gostaria de agendar um horário para corte de cabelo',
        healthcare: 'Boa tarde, preciso marcar uma consulta',
        legal: 'Preciso de orientação jurídica',
        education: 'Procuro aulas particulares de matemática',
        sports: 'Quero começar a treinar, como funciona?'
    };
    return messages[domain] || 'Gostaria de mais informações';
}

// Executar
adicionarDadosFaltantes()
    .then(() => {
        console.log('\n✅ DADOS FALTANTES ADICIONADOS!');
        process.exit(0);
    })
    .catch(erro => {
        console.error('❌ Erro fatal:', erro);
        process.exit(1);
    });