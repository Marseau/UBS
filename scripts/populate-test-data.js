const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

// ------------------- IMPORTANTE: Credenciais aplicadas -------------------
const supabaseUrl = 'https://qsdfyffuonywmtnlycri.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU';
// -------------------------------------------------------------------------


if (supabaseUrl === 'YOUR_SUPABASE_URL' || supabaseServiceRoleKey === 'YOUR_SUPABASE_SERVICE_ROLE_KEY') {
    console.error('\n❌ ERRO: Por favor, edite o arquivo "scripts/populate-test-data.js" e insira suas credenciais reais do Supabase.\n');
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function clearDatabase() {
    console.log('Limpando o banco de dados...');
    const tables = [
        'professional_availability_exceptions',
        'professional_services',
        'admin_users',
        'professionals',
        'appointments',
        'services',
        'service_categories',
        'user_tenants',
        'users',
        'tenants'
    ];
    for (const table of tables) {
        // Usamos um filtro que sempre será verdadeiro para deletar todas as linhas
        const { error } = await supabaseAdmin.from(table).delete().neq('id', uuidv4()); 
        if (error) console.error(`Erro ao limpar ${table}:`, error.message);
    }
    console.log('Banco de dados limpo.');
}


async function populateData() {
    try {
        await clearDatabase();
        
        console.log('1. Criando tenant de exemplo...');
        const { data: tenant, error: tenantError } = await supabaseAdmin
            .from('tenants')
            .insert({
                name: 'Clínica Saúde Plena',
                slug: 'saude-plena',
                business_name: 'Clínica Saúde Plena Ltda.',
                domain: 'healthcare',
                email: `contato-${uuidv4()}@saudeplena.com`, // Email único para permitir re-execução
                phone: `+55${Date.now()}`, // Telefone único
            })
            .select()
            .single();
        if (tenantError) throw tenantError;
        console.log(`Tenant '${tenant.name}' criado com ID: ${tenant.id}`);

        console.log('1.5. Criando usuário administrador para o tenant...');
        const { data: adminUser, error: adminError } = await supabaseAdmin
            .from('admin_users')
            .insert({
                email: 'admin@saudeplena.com',
                // Hash Bcrypt para a senha "admin123"
                password_hash: '$2b$10$rQFQj9HBKWQYbZYqQeqZRuEWbYpRsLZGcQ7P0XHYqH5QJ3YKXNYHy', 
                name: 'Admin da Clínica',
                role: 'tenant_admin',
                tenant_id: tenant.id // Vincula o admin ao tenant recém-criado
            })
            .select()
            .single();
        if(adminError) throw adminError;
        console.log(`Admin '${adminUser.email}' criado para o tenant.`);

        console.log('2. Criando categoria de serviço...');
        const { data: category, error: categoryError } = await supabaseAdmin
            .from('service_categories')
            .insert({ tenant_id: tenant.id, name: 'Consultas Médicas' })
            .select()
            .single();
        if (categoryError) throw categoryError;

        console.log('3. Criando serviços...');
        const { data: services, error: servicesError } = await supabaseAdmin
            .from('services')
            .insert([
                { tenant_id: tenant.id, category_id: category.id, name: 'Consulta Inicial', base_price: 250.00, duration_minutes: 50 },
                { tenant_id: tenant.id, category_id: category.id, name: 'Consulta de Retorno', base_price: 150.00, duration_minutes: 30 },
                { tenant_id: tenant.id, category_id: category.id, name: 'Exame de Rotina', base_price: 300.00, duration_minutes: 60 }
            ])
            .select();
        if (servicesError) throw servicesError;
        console.log(`${services.length} serviços criados.`);

        console.log('4. Criando profissionais...');
        const { data: professionals, error: profError } = await supabaseAdmin
            .from('professionals')
            .insert([
                {
                    tenant_id: tenant.id,
                    name: 'Dr. João Andrade',
                    email: `joao.andrade-${uuidv4()}@saudeplena.com`,
                    bio: 'Clínico Geral com 10 anos de experiência.',
                    working_hours: {
                        monday: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
                        wednesday: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
                        friday: [{ start: '09:00', end: '13:00' }],
                    }
                },
                {
                    tenant_id: tenant.id,
                    name: 'Dra. Maria Oliveira',
                    email: `maria.oliveira-${uuidv4()}@saudeplena.com`,
                    bio: 'Especialista em Cardiologia.',
                    working_hours: {
                        tuesday: [{ start: '09:00', end: '17:00' }],
                        thursday: [{ start: '09:00', end: '17:00' }],
                    }
                }
            ])
            .select();
        if (profError) throw profError;
        console.log(`${professionals.length} profissionais criados.`);
        const [drJoao, draMaria] = professionals;

        console.log('5. Associando serviços aos profissionais...');
        const { error: profServicesError } = await supabaseAdmin
            .from('professional_services')
            .insert([
                // Dr. João faz tudo com preço padrão
                { professional_id: drJoao.id, service_id: services[0].id, tenant_id: tenant.id },
                { professional_id: drJoao.id, service_id: services[1].id, tenant_id: tenant.id },
                { professional_id: drJoao.id, service_id: services[2].id, tenant_id: tenant.id },
                // Dra. Maria tem preço e duração customizados
                { professional_id: draMaria.id, service_id: services[0].id, tenant_id: tenant.id, price: 350.00, duration_minutes: 60 }, // Consulta mais cara e longa
                { professional_id: draMaria.id, service_id: services[1].id, tenant_id: tenant.id, price: 200.00 }, // Retorno mais caro
            ]);
        if (profServicesError) throw profServicesError;
        console.log('Serviços associados.');

        console.log('6. Adicionando exceções de agenda...');
        const { error: exceptionsError } = await supabaseAdmin
            .from('professional_availability_exceptions')
            .insert([
                {
                    professional_id: draMaria.id,
                    tenant_id: tenant.id,
                    start_time: new Date(new Date().getFullYear(), 6, 10, 0, 0, 0).toISOString(), // 10 de Julho
                    end_time: new Date(new Date().getFullYear(), 6, 20, 23, 59, 59).toISOString(), // 20 de Julho
                    is_available: false,
                    reason: 'Férias de Inverno'
                }
            ]);
        if (exceptionsError) throw exceptionsError;
        console.log('Exceção de agenda adicionada.');
        
        console.log('\n✅ Mock data populado com sucesso!');
        console.log('\nLogin para o tenant de teste:');
        console.log('Email: admin@saudeplena.com');
        console.log('Senha: admin123');

    } catch (err) {
        console.error('\n❌ Erro ao popular o banco de dados:', err.message);
    }
}

populateData(); 