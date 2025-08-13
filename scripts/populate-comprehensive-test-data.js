const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');

// ==================== CONFIGURAÇÃO ====================
const supabaseUrl = 'https://qsdfyffuonywmtnlycri.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// ==================== DADOS DE TESTE ====================

const SAMPLE_DATA = {
    tenants: [
        {
            name: 'Clínica Saúde Plena',
            slug: 'saude-plena',
            business_name: 'Clínica Saúde Plena Ltda',
            business_description: 'Clínica médica especializada em consultas gerais e exames',
            domain: 'healthcare',
            email: 'contato@saudeplena.com.br',
            phone: '+5511987654321',
            whatsapp_phone: '+5511987654321',
            business_address: {
                street: 'Rua das Flores, 123',
                neighborhood: 'Centro',
                city: 'São Paulo',
                state: 'SP',
                zip_code: '01234-567',
                country: 'Brasil'
            },
            ai_settings: {
                greeting_message: 'Olá! Bem-vindo à Clínica Saúde Plena. Como posso ajudá-lo hoje?',
                domain_keywords: ['consulta', 'exame', 'médico', 'saúde', 'agendamento'],
                escalation_triggers: ['emergência', 'urgente', 'dor forte'],
                sensitive_topics: ['diagnóstico', 'medicação', 'resultado de exame'],
                upsell_enabled: true,
                motivational_messages: true
            },
            business_rules: {
                working_hours: {
                    monday: [{ start: '08:00', end: '18:00' }],
                    tuesday: [{ start: '08:00', end: '18:00' }],
                    wednesday: [{ start: '08:00', end: '18:00' }],
                    thursday: [{ start: '08:00', end: '18:00' }],
                    friday: [{ start: '08:00', end: '17:00' }],
                    saturday: [{ start: '08:00', end: '12:00' }],
                    sunday: []
                },
                advance_booking_days: 60,
                cancellation_policy: 'Cancelamento com 24 horas de antecedência',
                payment_methods: ['dinheiro', 'cartão', 'pix'],
                travel_time_minutes: 15,
                package_discounts: true,
                peak_hours_surcharge: 0,
                loyalty_program: true
            }
        },
        {
            name: 'Salão Bella Vista',
            slug: 'bella-vista',
            business_name: 'Salão de Beleza Bella Vista ME',
            business_description: 'Salão de beleza completo com serviços de cabelo, estética e manicure',
            domain: 'beauty',
            email: 'agendamento@bellavista.com.br',
            phone: '+5511876543210',
            whatsapp_phone: '+5511876543210',
            business_address: {
                street: 'Av. Paulista, 1000',
                neighborhood: 'Bela Vista',
                city: 'São Paulo',
                state: 'SP',
                zip_code: '01310-100',
                country: 'Brasil'
            },
            ai_settings: {
                greeting_message: 'Olá, linda! Bem-vinda ao Salão Bella Vista! ✨',
                domain_keywords: ['cabelo', 'corte', 'manicure', 'sobrancelha', 'tratamento'],
                escalation_triggers: ['alergia', 'problema', 'reclamação'],
                sensitive_topics: ['química', 'alergia', 'cabelo danificado'],
                upsell_enabled: true,
                motivational_messages: true
            },
            business_rules: {
                working_hours: {
                    monday: [],
                    tuesday: [{ start: '09:00', end: '19:00' }],
                    wednesday: [{ start: '09:00', end: '19:00' }],
                    thursday: [{ start: '09:00', end: '19:00' }],
                    friday: [{ start: '09:00', end: '20:00' }],
                    saturday: [{ start: '08:00', end: '18:00' }],
                    sunday: [{ start: '10:00', end: '16:00' }]
                },
                advance_booking_days: 45,
                cancellation_policy: 'Cancelamento com 12 horas de antecedência',
                payment_methods: ['dinheiro', 'cartão', 'pix'],
                travel_time_minutes: 10,
                package_discounts: true,
                peak_hours_surcharge: 15,
                loyalty_program: true
            }
        },
        {
            name: 'Escritório Advocacia Silva & Associados',
            slug: 'silva-advocacia',
            business_name: 'Silva & Associados Advocacia Ltda',
            business_description: 'Escritório de advocacia especializado em direito civil, trabalhista e empresarial',
            domain: 'legal',
            email: 'contato@silvaadvocacia.com.br',
            phone: '+5511765432109',
            whatsapp_phone: '+5511765432109',
            business_address: {
                street: 'Rua Augusta, 500 - Conjunto 1205',
                neighborhood: 'Consolação',
                city: 'São Paulo',
                state: 'SP',
                zip_code: '01305-000',
                country: 'Brasil'
            },
            ai_settings: {
                greeting_message: 'Bem-vindo ao escritório Silva & Associados. Como podemos ajudá-lo juridicamente?',
                domain_keywords: ['processo', 'consulta jurídica', 'contrato', 'ação', 'direito'],
                escalation_triggers: ['urgente', 'prazo', 'intimação'],
                sensitive_topics: ['processo criminal', 'valores de honorários'],
                upsell_enabled: false,
                motivational_messages: false
            },
            business_rules: {
                working_hours: {
                    monday: [{ start: '09:00', end: '18:00' }],
                    tuesday: [{ start: '09:00', end: '18:00' }],
                    wednesday: [{ start: '09:00', end: '18:00' }],
                    thursday: [{ start: '09:00', end: '18:00' }],
                    friday: [{ start: '09:00', end: '17:00' }],
                    saturday: [],
                    sunday: []
                },
                advance_booking_days: 30,
                cancellation_policy: 'Cancelamento com 48 horas de antecedência',
                payment_methods: ['transferência', 'boleto', 'pix'],
                travel_time_minutes: 30,
                package_discounts: false,
                peak_hours_surcharge: 0,
                loyalty_program: false
            }
        }
    ],

    users: [
        { phone: '+5511999887766', name: 'Maria Silva Santos', email: 'maria.santos@gmail.com' },
        { phone: '+5511888776655', name: 'João Pedro Oliveira', email: 'joao.oliveira@hotmail.com' },
        { phone: '+5511777665544', name: 'Ana Carolina Lima', email: 'ana.lima@yahoo.com.br' },
        { phone: '+5511666554433', name: 'Carlos Eduardo Costa', email: 'carlos.costa@gmail.com' },
        { phone: '+5511555443322', name: 'Fernanda Almeida', email: 'fernanda.almeida@outlook.com' },
        { phone: '+5511444332211', name: 'Roberto Mendes', email: 'roberto.mendes@gmail.com' },
        { phone: '+5511333221100', name: 'Juliana Rocha', email: 'juliana.rocha@gmail.com' },
        { phone: '+5511222110099', name: 'Pedro Henrique', email: 'pedro.henrique@hotmail.com' },
        { phone: '+5511111009988', name: 'Camila Ferreira', email: 'camila.ferreira@gmail.com' },
        { phone: '+5511000998877', name: 'Ricardo Barbosa', email: 'ricardo.barbosa@yahoo.com.br' },
        { phone: '+5511999000111', name: 'Larissa Martins', email: 'larissa.martins@gmail.com' },
        { phone: '+5511888000222', name: 'Bruno Carvalho', email: 'bruno.carvalho@hotmail.com' }
    ],

    serviceCategories: {
        'healthcare': [
            { name: 'Consultas Médicas', description: 'Consultas com médicos especialistas' },
            { name: 'Exames', description: 'Exames laboratoriais e de imagem' },
            { name: 'Procedimentos', description: 'Pequenos procedimentos médicos' }
        ],
        'beauty': [
            { name: 'Cabelo', description: 'Serviços para cabelo' },
            { name: 'Estética Facial', description: 'Tratamentos faciais' },
            { name: 'Unhas', description: 'Manicure e pedicure' },
            { name: 'Sobrancelhas', description: 'Design e tratamento de sobrancelhas' }
        ],
        'legal': [
            { name: 'Consultas Jurídicas', description: 'Consultas e orientações jurídicas' },
            { name: 'Contratos', description: 'Elaboração e revisão de contratos' },
            { name: 'Processos', description: 'Acompanhamento processual' }
        ]
    },

    services: {
        'healthcare': [
            { name: 'Consulta Clínico Geral', duration_minutes: 30, base_price: 150.00, category: 'Consultas Médicas' },
            { name: 'Consulta Cardiologista', duration_minutes: 45, base_price: 200.00, category: 'Consultas Médicas' },
            { name: 'Consulta Dermatologista', duration_minutes: 30, base_price: 180.00, category: 'Consultas Médicas' },
            { name: 'Exame de Sangue Completo', duration_minutes: 15, base_price: 80.00, category: 'Exames' },
            { name: 'Eletrocardiograma', duration_minutes: 20, base_price: 60.00, category: 'Exames' },
            { name: 'Ultrassom Abdominal', duration_minutes: 30, base_price: 120.00, category: 'Exames' },
            { name: 'Pequena Cirurgia', duration_minutes: 60, base_price: 300.00, category: 'Procedimentos' },
            { name: 'Sutura Simples', duration_minutes: 20, base_price: 100.00, category: 'Procedimentos' }
        ],
        'beauty': [
            { name: 'Corte Feminino', duration_minutes: 45, base_price: 80.00, category: 'Cabelo' },
            { name: 'Corte Masculino', duration_minutes: 30, base_price: 50.00, category: 'Cabelo' },
            { name: 'Coloração Completa', duration_minutes: 120, base_price: 180.00, category: 'Cabelo' },
            { name: 'Escova Progressiva', duration_minutes: 180, base_price: 250.00, category: 'Cabelo' },
            { name: 'Limpeza de Pele', duration_minutes: 60, base_price: 90.00, category: 'Estética Facial' },
            { name: 'Hidratação Facial', duration_minutes: 45, base_price: 70.00, category: 'Estética Facial' },
            { name: 'Manicure Simples', duration_minutes: 30, base_price: 25.00, category: 'Unhas' },
            { name: 'Pedicure Completo', duration_minutes: 45, base_price: 35.00, category: 'Unhas' },
            { name: 'Design de Sobrancelhas', duration_minutes: 30, base_price: 40.00, category: 'Sobrancelhas' },
            { name: 'Micropigmentação', duration_minutes: 90, base_price: 300.00, category: 'Sobrancelhas' }
        ],
        'legal': [
            { name: 'Consulta Jurídica Inicial', duration_minutes: 60, base_price: 200.00, category: 'Consultas Jurídicas' },
            { name: 'Consulta de Acompanhamento', duration_minutes: 30, base_price: 100.00, category: 'Consultas Jurídicas' },
            { name: 'Elaboração de Contrato Simples', duration_minutes: 90, base_price: 400.00, category: 'Contratos' },
            { name: 'Revisão de Contrato', duration_minutes: 60, base_price: 250.00, category: 'Contratos' },
            { name: 'Petição Inicial', duration_minutes: 120, base_price: 800.00, category: 'Processos' },
            { name: 'Recurso', duration_minutes: 180, base_price: 1200.00, category: 'Processos' },
            { name: 'Audiência', duration_minutes: 240, base_price: 600.00, category: 'Processos' }
        ]
    },

    professionals: {
        'healthcare': [
            {
                name: 'Dr. João Carlos Mendes',
                email: 'joao.mendes@saudeplena.com.br',
                phone: '+5511987654322',
                specialties: ['Clínica Geral', 'Cardiologia'],
                bio: 'Médico com 15 anos de experiência em clínica geral e cardiologia.',
                working_hours: {
                    monday: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
                    tuesday: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
                    wednesday: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
                    thursday: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
                    friday: [{ start: '08:00', end: '12:00' }],
                    saturday: [],
                    sunday: []
                }
            },
            {
                name: 'Dra. Maria Fernanda Silva',
                email: 'maria.silva@saudeplena.com.br',
                phone: '+5511987654323',
                specialties: ['Dermatologia', 'Estética'],
                bio: 'Dermatologista especializada em estética e tratamentos de pele.',
                working_hours: {
                    monday: [{ start: '09:00', end: '17:00' }],
                    tuesday: [{ start: '09:00', end: '17:00' }],
                    wednesday: [{ start: '09:00', end: '17:00' }],
                    thursday: [{ start: '09:00', end: '17:00' }],
                    friday: [{ start: '09:00', end: '16:00' }],
                    saturday: [{ start: '08:00', end: '12:00' }],
                    sunday: []
                }
            }
        ],
        'beauty': [
            {
                name: 'Isabella Santos',
                email: 'isabella@bellavista.com.br',
                phone: '+5511876543211',
                specialties: ['Coloração', 'Corte Feminino', 'Tratamentos Capilares'],
                bio: 'Cabeleireira especialista em coloração e cortes femininos com 10 anos de experiência.',
                working_hours: {
                    monday: [],
                    tuesday: [{ start: '09:00', end: '19:00' }],
                    wednesday: [{ start: '09:00', end: '19:00' }],
                    thursday: [{ start: '09:00', end: '19:00' }],
                    friday: [{ start: '09:00', end: '20:00' }],
                    saturday: [{ start: '08:00', end: '18:00' }],
                    sunday: []
                }
            },
            {
                name: 'Carla Rodrigues',
                email: 'carla@bellavista.com.br',
                phone: '+5511876543212',
                specialties: ['Estética Facial', 'Sobrancelhas', 'Unhas'],
                bio: 'Esteticista e designer de sobrancelhas com certificação internacional.',
                working_hours: {
                    monday: [],
                    tuesday: [{ start: '10:00', end: '18:00' }],
                    wednesday: [{ start: '10:00', end: '18:00' }],
                    thursday: [{ start: '10:00', end: '18:00' }],
                    friday: [{ start: '10:00', end: '19:00' }],
                    saturday: [{ start: '09:00', end: '17:00' }],
                    sunday: [{ start: '10:00', end: '16:00' }]
                }
            }
        ],
        'legal': [
            {
                name: 'Dr. Rodrigo Silva',
                email: 'rodrigo@silvaadvocacia.com.br',
                phone: '+5511765432110',
                specialties: ['Direito Civil', 'Direito Empresarial'],
                bio: 'Advogado sócio-fundador com 20 anos de experiência em direito civil e empresarial.',
                working_hours: {
                    monday: [{ start: '09:00', end: '18:00' }],
                    tuesday: [{ start: '09:00', end: '18:00' }],
                    wednesday: [{ start: '09:00', end: '18:00' }],
                    thursday: [{ start: '09:00', end: '18:00' }],
                    friday: [{ start: '09:00', end: '17:00' }],
                    saturday: [],
                    sunday: []
                }
            },
            {
                name: 'Dra. Patricia Oliveira',
                email: 'patricia@silvaadvocacia.com.br',
                phone: '+5511765432111',
                specialties: ['Direito Trabalhista', 'Direito Previdenciário'],
                bio: 'Advogada especialista em direito trabalhista e previdenciário.',
                working_hours: {
                    monday: [{ start: '10:00', end: '18:00' }],
                    tuesday: [{ start: '10:00', end: '18:00' }],
                    wednesday: [{ start: '10:00', end: '18:00' }],
                    thursday: [{ start: '10:00', end: '18:00' }],
                    friday: [{ start: '10:00', end: '16:00' }],
                    saturday: [],
                    sunday: []
                }
            }
        ]
    }
};

// ==================== FUNÇÕES AUXILIARES ====================

function generateRandomDate(daysBack = 30, daysForward = 30) {
    const now = new Date();
    const minDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
    const maxDate = new Date(now.getTime() + (daysForward * 24 * 60 * 60 * 1000));
    return new Date(minDate.getTime() + Math.random() * (maxDate.getTime() - minDate.getTime()));
}

function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function getRandomElements(array, count) {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

async function clearDatabase() {
    console.log('🧹 Limpando banco de dados...');
    
    const tables = [
        'system_health_logs',
        'stripe_customers',
        'calendar_sync_tokens',
        'function_executions',
        'email_logs',
        'whatsapp_media',
        'conversation_states',
        'conversation_history',
        'appointments',
        'availability_templates',
        'professionals',
        'services',
        'service_categories',
        'user_tenants',
        'rules',
        'admin_users',
        'users',
        'tenants'
    ];

    for (const table of tables) {
        try {
            if (table === 'user_tenants') {
                // Não existe coluna 'id' nessa tabela
                await supabase.from(table).delete();
            } else {
                await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
            }
            console.log(`   ✅ Tabela ${table} limpa`);
        } catch (error) {
            console.log(`   ⚠️  Erro ao limpar ${table}: ${error.message}`);
        }
    }
}

// ==================== FUNÇÃO PRINCIPAL ====================

async function populateAllTables() {
    console.log('🚀 Iniciando população completa do banco de dados...\n');

    try {
        // 1. Limpar dados existentes
        await clearDatabase();
        console.log('\n');

        // 2. Criar Super Administrador
        console.log('👑 Criando Super Administrador...');
        const superAdminData = {
            id: uuidv4(),
            email: 'admin@universalbooking.com',
            password_hash: await bcrypt.hash('admin123', 10),
            name: 'Super Administrador',
            role: 'super_admin',
            tenant_id: null,
            permissions: ['*'],
            is_active: true
        };

        const { error: superAdminError } = await supabase
            .from('admin_users')
            .insert([superAdminData]);

        if (superAdminError) throw superAdminError;
        console.log('   ✅ Super Administrador criado com sucesso');

        // 3. Criar Tenants
        console.log('\n🏢 Criando Tenants...');
        const tenantIds = {};
        
        for (const tenantData of SAMPLE_DATA.tenants) {
            const tenantId = uuidv4();
            tenantIds[tenantData.domain] = tenantId;

            const { error: tenantError } = await supabase
                .from('tenants')
                .insert([{ ...tenantData, id: tenantId }]);

            if (tenantError) throw tenantError;
            console.log(`   ✅ Tenant "${tenantData.name}" criado`);

            // Criar admin para cada tenant
            const adminData = {
                id: uuidv4(),
                email: tenantData.email.replace('contato@', 'admin@').replace('agendamento@', 'admin@'),
                password_hash: await bcrypt.hash('admin123', 10),
                name: `Admin ${tenantData.name}`,
                role: 'tenant_admin',
                tenant_id: tenantId,
                permissions: ['manage_appointments', 'manage_customers', 'manage_services'],
                is_active: true
            };

            const { error: adminError } = await supabase
                .from('admin_users')
                .insert([adminData]);

            if (adminError) throw adminError;
            console.log(`   ✅ Admin para "${tenantData.name}" criado`);
        }

        // 4. Criar Usuários
        console.log('\n👥 Criando Usuários...');
        const userIds = [];
        
        for (const userData of SAMPLE_DATA.users) {
            const userId = uuidv4();
            userIds.push(userId);

            const { error: userError } = await supabase
                .from('users')
                .insert([{
                    ...userData,
                    id: userId,
                    preferences: {
                        notifications: true,
                        marketing: Math.random() > 0.5,
                        reminder_hours: Math.floor(Math.random() * 24) + 1
                    }
                }]);

            if (userError) throw userError;
        }
        console.log(`   ✅ ${SAMPLE_DATA.users.length} usuários criados`);

        // 5. Criar User-Tenant relationships
        console.log('\n🔗 Criando relacionamentos User-Tenant...');
        const userTenantData = [];
        
        for (let i = 0; i < userIds.length; i++) {
            const userId = userIds[i];
            const tenantDomains = Object.keys(tenantIds);
            
            // Cada usuário será cliente de 1-2 tenants aleatórios
            const numberOfTenants = Math.random() > 0.7 ? 2 : 1;
            const selectedTenants = getRandomElements(tenantDomains, numberOfTenants);
            
            for (const domain of selectedTenants) {
                userTenantData.push({
                    user_id: userId,
                    tenant_id: tenantIds[domain],
                    role: 'customer',
                    tenant_preferences: {
                        preferred_time: getRandomElement(['morning', 'afternoon', 'evening']),
                        communication_method: getRandomElement(['whatsapp', 'email', 'phone']),
                        reminders: true
                    },
                    first_interaction: generateRandomDate(60, 0),
                    last_interaction: generateRandomDate(7, 0),
                    total_bookings: Math.floor(Math.random() * 15)
                });
            }
        }

        const { error: userTenantError } = await supabase
            .from('user_tenants')
            .insert(userTenantData);

        if (userTenantError) throw userTenantError;
        console.log(`   ✅ ${userTenantData.length} relacionamentos User-Tenant criados`);

        // 6. Criar Categorias de Serviços
        console.log('\n📂 Criando Categorias de Serviços...');
        const categoryIds = {};
        
        for (const [domain, categories] of Object.entries(SAMPLE_DATA.serviceCategories)) {
            categoryIds[domain] = {};
            
            for (let i = 0; i < categories.length; i++) {
                const category = categories[i];
                const categoryId = uuidv4();
                categoryIds[domain][category.name] = categoryId;

                const { error: categoryError } = await supabase
                    .from('service_categories')
                    .insert([{
                        id: categoryId,
                        tenant_id: tenantIds[domain],
                        name: category.name,
                        description: category.description,
                        display_order: i
                    }]);

                if (categoryError) throw categoryError;
            }
            console.log(`   ✅ Categorias para ${domain} criadas`);
        }

        // 7. Criar Serviços
        console.log('\n🛍️ Criando Serviços...');
        const serviceIds = {};
        
        for (const [domain, services] of Object.entries(SAMPLE_DATA.services)) {
            serviceIds[domain] = [];
            
            for (let i = 0; i < services.length; i++) {
                const service = services[i];
                const serviceId = uuidv4();
                serviceIds[domain].push(serviceId);

                const { error: serviceError } = await supabase
                    .from('services')
                    .insert([{
                        id: serviceId,
                        tenant_id: tenantIds[domain],
                        category_id: categoryIds[domain][service.category],
                        name: service.name,
                        description: `Descrição detalhada do serviço: ${service.name}`,
                        duration_type: 'fixed',
                        duration_minutes: service.duration_minutes,
                        price_model: 'fixed',
                        base_price: service.base_price,
                        currency: 'BRL',
                        service_config: {
                            requires_preparation: Math.random() > 0.7,
                            cleanup_time: Math.floor(Math.random() * 15),
                            materials_needed: []
                        },
                        is_active: true,
                        display_order: i,
                        advance_booking_days: Math.floor(Math.random() * 30) + 1,
                        max_bookings_per_day: Math.floor(Math.random() * 10) + 5
                    }]);

                if (serviceError) throw serviceError;
            }
            console.log(`   ✅ ${services.length} serviços para ${domain} criados`);
        }

        // 8. Criar Profissionais
        console.log('\n👨‍⚕️ Criando Profissionais...');
        const professionalIds = {};
        
        for (const [domain, professionals] of Object.entries(SAMPLE_DATA.professionals)) {
            professionalIds[domain] = [];
            
            for (const professional of professionals) {
                const professionalId = uuidv4();
                professionalIds[domain].push(professionalId);

                const { error: professionalError } = await supabase
                    .from('professionals')
                    .insert([{
                        id: professionalId,
                        tenant_id: tenantIds[domain],
                        name: professional.name,
                        email: professional.email,
                        phone: professional.phone,
                        specialties: professional.specialties,
                        bio: professional.bio,
                        avatar_url: null,
                        is_active: true,
                        working_hours: professional.working_hours
                    }]);

                if (professionalError) throw professionalError;
            }
            console.log(`   ✅ ${professionals.length} profissionais para ${domain} criados`);
        }

        // 9. Criar Templates de Disponibilidade
        console.log('\n📅 Criando Templates de Disponibilidade...');
        
        for (const [domain, tenantId] of Object.entries(tenantIds)) {
            const templateData = {
                id: uuidv4(),
                tenant_id: tenantId,
                name: 'Template Padrão',
                is_default: true,
                monday_slots: [{ start: '09:00', end: '18:00' }],
                tuesday_slots: [{ start: '09:00', end: '18:00' }],
                wednesday_slots: [{ start: '09:00', end: '18:00' }],
                thursday_slots: [{ start: '09:00', end: '18:00' }],
                friday_slots: [{ start: '09:00', end: '17:00' }],
                saturday_slots: domain === 'legal' ? [] : [{ start: '09:00', end: '13:00' }],
                sunday_slots: [],
                special_dates: {
                    '2025-12-25': { closed: true, reason: 'Natal' },
                    '2025-01-01': { closed: true, reason: 'Ano Novo' }
                }
            };

            const { error: templateError } = await supabase
                .from('availability_templates')
                .insert([templateData]);

            if (templateError) throw templateError;
        }
        console.log('   ✅ Templates de disponibilidade criados');

        // 10. Criar Agendamentos
        console.log('\n📋 Criando Agendamentos...');
        const appointmentData = [];
        
        for (const [domain, tenantId] of Object.entries(tenantIds)) {
            const tenantUsers = userTenantData.filter(ut => ut.tenant_id === tenantId);
            const tenantServices = serviceIds[domain];
            const statuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];
            
            // Criar 15-25 agendamentos por tenant
            const appointmentCount = Math.floor(Math.random() * 11) + 15;
            
            for (let i = 0; i < appointmentCount; i++) {
                const userTenant = getRandomElement(tenantUsers);
                const serviceId = getRandomElement(tenantServices);
                const status = getRandomElement(statuses);
                const startTime = generateRandomDate(30, 30);
                const endTime = new Date(startTime.getTime() + (Math.floor(Math.random() * 120) + 30) * 60000);

                appointmentData.push({
                    id: uuidv4(),
                    tenant_id: tenantId,
                    user_id: userTenant.user_id,
                    service_id: serviceId,
                    start_time: startTime.toISOString(),
                    end_time: endTime.toISOString(),
                    timezone: 'America/Sao_Paulo',
                    status: status,
                    quoted_price: Math.floor(Math.random() * 500) + 50,
                    final_price: status === 'completed' ? Math.floor(Math.random() * 500) + 50 : null,
                    currency: 'BRL',
                    appointment_data: {
                        source: getRandomElement(['whatsapp', 'website', 'phone']),
                        payment_method: getRandomElement(['cash', 'card', 'pix']),
                        first_time_customer: Math.random() > 0.7
                    },
                    customer_notes: Math.random() > 0.5 ? 'Observações do cliente sobre o agendamento' : null,
                    internal_notes: Math.random() > 0.7 ? 'Notas internas sobre o cliente' : null,
                    cancelled_at: status === 'cancelled' ? generateRandomDate(7, 0).toISOString() : null,
                    cancelled_by: status === 'cancelled' ? getRandomElement(['customer', 'professional', 'system']) : null,
                    cancellation_reason: status === 'cancelled' ? 'Motivo do cancelamento' : null
                });
            }
        }

        const { error: appointmentError } = await supabase
            .from('appointments')
            .insert(appointmentData);

        if (appointmentError) throw appointmentError;
        console.log(`   ✅ ${appointmentData.length} agendamentos criados`);

        // 11. Criar Histórico de Conversas
        console.log('\n💬 Criando Histórico de Conversas...');
        const conversationData = [];
        
        for (const [domain, tenantId] of Object.entries(tenantIds)) {
            const tenantUsers = userTenantData.filter(ut => ut.tenant_id === tenantId);
            
            // 50-100 mensagens por tenant
            const messageCount = Math.floor(Math.random() * 51) + 50;
            
            for (let i = 0; i < messageCount; i++) {
                const userTenant = getRandomElement(tenantUsers);
                const isFromUser = Math.random() > 0.4;
                const intents = ['greeting', 'booking', 'question', 'confirmation', 'cancellation'];
                
                conversationData.push({
                    id: uuidv4(),
                    tenant_id: tenantId,
                    user_id: userTenant.user_id,
                    content: isFromUser ? 
                        getRandomElement([
                            'Olá, gostaria de agendar um horário',
                            'Qual o valor da consulta?',
                            'Preciso cancelar meu agendamento',
                            'Que horas vocês atendem?',
                            'Obrigado pelo atendimento'
                        ]) :
                        getRandomElement([
                            'Olá! Como posso ajudá-lo?',
                            'Claro, vou verificar nossa agenda',
                            'O valor é R$ 150,00',
                            'Atendemos de segunda a sexta das 8h às 18h',
                            'Foi um prazer atendê-lo!'
                        ]),
                    is_from_user: isFromUser,
                    message_type: getRandomElement(['text', 'audio', 'image']),
                    intent_detected: isFromUser ? getRandomElement(intents) : null,
                    confidence_score: isFromUser ? Math.random() * 0.4 + 0.6 : null,
                    conversation_context: {
                        session_id: uuidv4(),
                        step: Math.floor(Math.random() * 5) + 1,
                        topic: getRandomElement(['booking', 'information', 'support'])
                    },
                    created_at: generateRandomDate(30, 0).toISOString()
                });
            }
        }

        const { error: conversationError } = await supabase
            .from('conversation_history')
            .insert(conversationData);

        if (conversationError) throw conversationError;
        console.log(`   ✅ ${conversationData.length} mensagens de conversa criadas`);

        // 12. Criar Estados de Conversa
        console.log('\n🔄 Criando Estados de Conversa...');
        const conversationStates = [];
        
        for (const [domain, tenantId] of Object.entries(tenantIds)) {
            const tenantUsers = userTenantData.filter(ut => ut.tenant_id === tenantId);
            
            // 30% dos usuários têm estado ativo
            const activeUsers = tenantUsers.filter(() => Math.random() > 0.7);
            
            for (const userTenant of activeUsers) {
                const states = ['idle', 'booking', 'confirming', 'waiting_payment', 'completed'];
                
                conversationStates.push({
                    id: uuidv4(),
                    tenant_id: tenantId,
                    user_id: userTenant.user_id,
                    current_state: getRandomElement(states),
                    context: {
                        last_action: 'user_message',
                        booking_data: {
                            service_id: getRandomElement(serviceIds[domain] || []),
                            preferred_date: generateRandomDate(0, 7).toISOString().split('T')[0],
                            preferred_time: getRandomElement(['09:00', '14:00', '16:00'])
                        },
                        retry_count: 0
                    },
                    expires_at: generateRandomDate(0, 1).toISOString()
                });
            }
        }

        if (conversationStates.length > 0) {
            const { error: stateError } = await supabase
                .from('conversation_states')
                .insert(conversationStates);

            if (stateError) throw stateError;
        }
        console.log(`   ✅ ${conversationStates.length} estados de conversa criados`);

        // 13. Criar Mídia do WhatsApp
        console.log('\n📷 Criando Mídia do WhatsApp...');
        const mediaData = [];
        
        for (const [domain, tenantId] of Object.entries(tenantIds)) {
            const tenantUsers = userTenantData.filter(ut => ut.tenant_id === tenantId);
            
            // 10-20 mídias por tenant
            const mediaCount = Math.floor(Math.random() * 11) + 10;
            
            for (let i = 0; i < mediaCount; i++) {
                const userTenant = getRandomElement(tenantUsers);
                const mediaTypes = ['image', 'audio', 'video', 'document'];
                const mediaType = getRandomElement(mediaTypes);
                
                mediaData.push({
                    id: uuidv4(),
                    tenant_id: tenantId,
                    user_id: userTenant.user_id,
                    whatsapp_id: `whatsapp_${uuidv4()}`,
                    media_type: mediaType,
                    filename: `${mediaType}_${i}.${mediaType === 'image' ? 'jpg' : mediaType === 'audio' ? 'ogg' : 'mp4'}`,
                    file_size: Math.floor(Math.random() * 5000000) + 100000,
                    mime_type: `${mediaType}/${mediaType === 'image' ? 'jpeg' : mediaType}`,
                    url: `https://example.com/media/${mediaType}_${i}`,
                    processed_url: `https://example.com/processed/${mediaType}_${i}`,
                    processing_status: getRandomElement(['completed', 'pending', 'failed']),
                    processing_result: {
                        width: mediaType === 'image' ? Math.floor(Math.random() * 1920) + 320 : null,
                        height: mediaType === 'image' ? Math.floor(Math.random() * 1080) + 240 : null,
                        duration: mediaType === 'audio' || mediaType === 'video' ? Math.floor(Math.random() * 300) + 10 : null
                    },
                    created_at: generateRandomDate(30, 0).toISOString()
                });
            }
        }

        const { error: mediaError } = await supabase
            .from('whatsapp_media')
            .insert(mediaData);

        if (mediaError) throw mediaError;
        console.log(`   ✅ ${mediaData.length} itens de mídia criados`);

        // 14. Criar Regras de Negócio
        console.log('\n⚙️ Criando Regras de Negócio...');
        const rulesData = [];
        
        for (const [domain, tenantId] of Object.entries(tenantIds)) {
            const domainRules = {
                'healthcare': [
                    {
                        name: 'Lembrete de Consulta',
                        description: 'Enviar lembrete 24h antes da consulta',
                        trigger_event: 'appointment_created',
                        conditions: [{ field: 'status', operator: 'equals', value: 'confirmed' }],
                        actions: [{ type: 'send_reminder', delay_hours: 24 }]
                    },
                    {
                        name: 'Follow-up Pós-Consulta',
                        description: 'Enviar mensagem de follow-up após consulta',
                        trigger_event: 'appointment_completed',
                        conditions: [{ field: 'service_type', operator: 'contains', value: 'consulta' }],
                        actions: [{ type: 'send_followup', delay_hours: 48 }]
                    }
                ],
                'beauty': [
                    {
                        name: 'Promoção Clientes Frequentes',
                        description: 'Oferecer desconto para clientes com mais de 5 agendamentos',
                        trigger_event: 'appointment_booking',
                        conditions: [{ field: 'total_bookings', operator: 'greater_than', value: 5 }],
                        actions: [{ type: 'apply_discount', percentage: 10 }]
                    },
                    {
                        name: 'Lembrete de Retoque',
                        description: 'Lembrar cliente sobre retoque após 30 dias',
                        trigger_event: 'service_completed',
                        conditions: [{ field: 'service_name', operator: 'contains', value: 'coloração' }],
                        actions: [{ type: 'send_reminder', delay_days: 30 }]
                    }
                ],
                'legal': [
                    {
                        name: 'Confirmação de Audiência',
                        description: 'Confirmar presença em audiência 48h antes',
                        trigger_event: 'hearing_scheduled',
                        conditions: [{ field: 'event_type', operator: 'equals', value: 'audiência' }],
                        actions: [{ type: 'send_confirmation', delay_hours: 48 }]
                    }
                ]
            };

            for (const rule of domainRules[domain]) {
                rulesData.push({
                    id: uuidv4(),
                    tenant_id: tenantId,
                    name: rule.name,
                    description: rule.description,
                    trigger_event: rule.trigger_event,
                    conditions: rule.conditions,
                    actions: rule.actions,
                    is_active: true,
                    priority: Math.floor(Math.random() * 10),
                    execution_count: Math.floor(Math.random() * 100),
                    last_executed: generateRandomDate(10, 0).toISOString()
                });
            }
        }

        const { error: rulesError } = await supabase
            .from('rules')
            .insert(rulesData);

        if (rulesError) throw rulesError;
        console.log(`   ✅ ${rulesData.length} regras de negócio criadas`);

        // 15. Criar Logs de E-mail
        console.log('\n📧 Criando Logs de E-mail...');
        const emailLogs = [];
        for (const [domain, tenantId] of Object.entries(tenantIds)) {
            for (let i = 0; i < 10; i++) {
                emailLogs.push({
                    id: uuidv4(),
                    tenant_id: tenantId,
                    user_id: getRandomElement(userIds),
                    email_type: getRandomElement(['welcome', 'reminder', 'notification', 'alert']),
                    recipient_email: `cliente${i}@${domain}.com`,
                    subject: `Assunto de Teste ${i}`,
                    sent_at: generateRandomDate(15, 0).toISOString(),
                    status: getRandomElement(['sent', 'failed', 'pending']),
                    error_message: Math.random() > 0.8 ? 'Falha no envio' : null,
                    email_data: { custom_field: 'valor' }
                });
            }
        }
        const { error: emailError } = await supabase
            .from('email_logs')
            .insert(emailLogs);

        if (emailError) throw emailError;
        console.log(`   ✅ ${emailLogs.length} logs de e-mail criados`);

        // 16. Criar Execuções de Função (AI)
        console.log('\n🤖 Criando Execuções de Função...');
        const functionExecutions = [];
        for (const [domain, tenantId] of Object.entries(tenantIds)) {
            for (let i = 0; i < 10; i++) {
                functionExecutions.push({
                    id: uuidv4(),
                    tenant_id: tenantId,
                    user_id: getRandomElement(userIds),
                    function_name: getRandomElement(['book_appointment', 'cancel_appointment', 'send_reminder']),
                    parameters: { param1: 'valor1', param2: 'valor2' },
                    result: { success: Math.random() > 0.2 },
                    execution_time_ms: Math.floor(Math.random() * 500) + 100,
                    status: getRandomElement(['success', 'error', 'timeout']),
                    error_message: Math.random() > 0.8 ? 'Erro de execução' : null,
                    created_at: generateRandomDate(10, 0).toISOString()
                });
            }
        }
        const { error: funcError } = await supabase
            .from('function_executions')
            .insert(functionExecutions);

        if (funcError) throw funcError;
        console.log(`   ✅ ${functionExecutions.length} execuções de função criadas`);

        // 17. Criar Tokens de Sincronização de Calendário
        console.log('\n🔑 Criando Tokens de Sincronização de Calendário...');
        const calendarTokens = [];
        for (const [domain, tenantId] of Object.entries(tenantIds)) {
            calendarTokens.push({
                id: uuidv4(),
                tenant_id: tenantId,
                calendar_id: `calendar_${domain}`,
                sync_token: uuidv4(),
                last_sync: generateRandomDate(2, 0).toISOString()
            });
        }
        const { error: calError } = await supabase
            .from('calendar_sync_tokens')
            .insert(calendarTokens);

        if (calError) throw calError;
        console.log(`   ✅ ${calendarTokens.length} tokens de calendário criados`);

        // 18. Criar Clientes Stripe
        console.log('\n💳 Criando Clientes Stripe...');
        const stripeCustomers = [];
        const usedUserIds = new Set();
        let count = 0;
        while (count < 5 && usedUserIds.size < userIds.length) {
            const userId = getRandomElement(userIds);
            const key = `${tenantIds[domain]}_${userId}`;
            if (usedUserIds.has(key)) continue;
            usedUserIds.add(key);

            stripeCustomers.push({
                id: uuidv4(),
                tenant_id: tenantIds[domain],
                user_id: userId,
                stripe_customer_id: `cus_${uuidv4().slice(0, 8)}`,
                subscription_id: `sub_${uuidv4().slice(0, 8)}`,
                subscription_status: getRandomElement(['active', 'canceled', 'past_due']),
                subscription_data: { plan: getRandomElement(['basic', 'premium', 'pro']) }
            });
            count++;
        }
        const { error: stripeError } = await supabase
            .from('stripe_customers')
            .insert(stripeCustomers);

        if (stripeError) throw stripeError;
        console.log(`   ✅ ${stripeCustomers.length} clientes Stripe criados`);

        // 19. Criar Logs de Saúde do Sistema
        console.log('\n🩺 Criando Logs de Saúde do Sistema...');
        const healthLogs = [];
        for (const [domain, tenantId] of Object.entries(tenantIds)) {
            for (let i = 0; i < 5; i++) {
                healthLogs.push({
                    id: uuidv4(),
                    tenant_id: tenantId,
                    component: getRandomElement(['api', 'db', 'worker', 'frontend']),
                    status: getRandomElement(['healthy', 'warning', 'error']),
                    message: 'Log de teste do sistema',
                    metrics: { cpu: Math.random(), memory: Math.random() },
                    created_at: generateRandomDate(5, 0).toISOString()
                });
            }
        }
        const { error: healthError } = await supabase
            .from('system_health_logs')
            .insert(healthLogs);

        if (healthError) throw healthError;
        console.log(`   ✅ ${healthLogs.length} logs de saúde do sistema criados`);

        console.log('\n🎉 População completa finalizada com sucesso!');
    } catch (err) {
        console.error('❌ Erro ao popular o banco de dados:', err);
    }
}

// ==================== EXECUÇÃO ====================
populateAllTables();