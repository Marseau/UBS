/**
 * VERIFICAÇÃO FINAL DO BANCO DE DADOS
 */

const { supabaseAdmin } = require('./dist/config/database.js');

async function verificarBancoFinal() {
    console.log('🔍 VERIFICAÇÃO FINAL DO BANCO DE DADOS\n');
    
    try {
        console.log('📊 RESUMO GERAL:');
        console.log('='.repeat(60));
        
        // Contar registros em cada tabela
        const tabelas = [
            'admin_users',
            'tenants', 
            'professionals',
            'service_categories',
            'services',
            'users',
            'user_tenants',
            'conversation_history',
            'appointments',
            'crawled_pages'
        ];
        
        const resumo = {};
        
        for (const tabela of tabelas) {
            const { count, error } = await supabaseAdmin
                .from(tabela)
                .select('*', { count: 'exact', head: true });
            
            resumo[tabela] = count || 0;
            console.log(`  ${tabela}: ${count || 0}`);
        }
        
        console.log('\n📊 DETALHES POR TENANT:');
        console.log('='.repeat(60));
        
        // Buscar tenants
        const { data: tenants } = await supabaseAdmin
            .from('tenants')
            .select('*')
            .order('name');
        
        for (const tenant of tenants) {
            console.log(`\n🏢 ${tenant.name} (${tenant.domain}):`);
            
            // Profissionais
            const { count: profCount } = await supabaseAdmin
                .from('professionals')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenant.id);
            
            // Serviços
            const { count: servCount } = await supabaseAdmin
                .from('services')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenant.id);
            
            // Usuários
            const { count: userCount } = await supabaseAdmin
                .from('user_tenants')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenant.id);
            
            // Conversas
            const { count: convCount } = await supabaseAdmin
                .from('conversation_history')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenant.id);
            
            // Agendamentos
            const { count: aptCount } = await supabaseAdmin
                .from('appointments')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenant.id);
            
            console.log(`  • Profissionais: ${profCount || 0}`);
            console.log(`  • Serviços: ${servCount || 0}`);
            console.log(`  • Usuários: ${userCount || 0}`);
            console.log(`  • Conversas: ${convCount || 0}`);
            console.log(`  • Agendamentos: ${aptCount || 0}`);
        }
        
        console.log('\n📊 ANÁLISE DE COMPLETUDE:');
        console.log('='.repeat(60));
        
        const esperado = {
            tenants: 10,
            professionals: 40, // 4 por tenant
            services: 80, // 8 por tenant
            users: 800, // 80 por tenant
            conversations: 9600, // 4/mês × 3 meses × 800 users
            appointments: 7080 // 73.75% de 9600
        };
        
        const atual = {
            tenants: resumo.tenants,
            professionals: resumo.professionals,
            services: resumo.services,
            users: resumo.users,
            conversations: resumo.conversation_history,
            appointments: resumo.appointments
        };
        
        console.log('  Tipo          | Esperado | Atual | Status');
        console.log('  ' + '-'.repeat(45));
        
        for (const [tipo, valor] of Object.entries(esperado)) {
            const atualValor = atual[tipo];
            const percentual = ((atualValor / valor) * 100).toFixed(1);
            const status = atualValor >= valor ? '✅' : '⚠️';
            
            console.log(`  ${tipo.padEnd(12)} | ${valor.toString().padStart(8)} | ${atualValor.toString().padStart(5)} | ${status} ${percentual}%`);
        }
        
        console.log('\n📊 PRÓXIMOS PASSOS:');
        console.log('='.repeat(60));
        
        if (resumo.conversation_history === 0) {
            console.log('  ⚠️  Adicionar conversas (conversation_history)');
        }
        if (resumo.appointments === 0) {
            console.log('  ⚠️  Adicionar agendamentos (appointments)');
        }
        if (resumo.users < 800) {
            console.log('  ⚠️  Adicionar mais usuários (faltam ' + (800 - resumo.users) + ')');
        }
        
        if (resumo.conversation_history > 0 && resumo.appointments > 0) {
            console.log('  ✅ Banco de dados populado com sucesso!');
        }
        
    } catch (erro) {
        console.error('❌ Erro:', erro.message);
    }
}

// Executar
verificarBancoFinal()
    .then(() => {
        console.log('\n✅ Verificação concluída!');
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Erro fatal:', err);
        process.exit(1);
    });