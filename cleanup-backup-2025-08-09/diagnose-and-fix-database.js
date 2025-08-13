const { createClient } = require('@supabase/supabase-js');

// ==================== CONFIGURAÇÃO ====================
const supabaseUrl = 'https://qsdfyffuonywmtnlycri.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// ==================== DIAGNÓSTICO ====================

async function checkTableExists(tableName) {
    try {
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .limit(1);
        
        return !error;
    } catch (err) {
        return false;
    }
}

async function checkColumnExists(tableName, columnName) {
    try {
        const { data, error } = await supabase
            .from(tableName)
            .select(columnName)
            .limit(1);
        
        return !error;
    } catch (err) {
        return false;
    }
}

async function executeSQLRaw(sql) {
    try {
        const { data, error } = await supabase.rpc('exec_sql', { sql });
        if (error) {
            console.log(`   ⚠️ Erro SQL: ${error.message}`);
            return false;
        }
        return true;
    } catch (err) {
        console.log(`   ⚠️ Erro SQL: ${err.message}`);
        return false;
    }
}

async function diagnoseDatabase() {
    console.log('🔍 DIAGNÓSTICO DO BANCO DE DADOS');
    console.log('='.repeat(50));

    const tablesToCheck = [
        'tenants',
        'users', 
        'user_tenants',
        'services',
        'service_categories',
        'professionals',
        'appointments',
        'conversation_states',
        'conversation_history',
        'professional_services',
        'professional_availability_exceptions',
        'professional_schedules'
    ];

    console.log('\n📋 VERIFICANDO TABELAS EXISTENTES...');
    console.log('-'.repeat(40));

    const existingTables = [];
    const missingTables = [];

    for (const table of tablesToCheck) {
        const exists = await checkTableExists(table);
        if (exists) {
            existingTables.push(table);
            console.log(`   ✅ ${table}`);
        } else {
            missingTables.push(table);
            console.log(`   ❌ ${table}`);
        }
    }

    console.log(`\n📊 RESUMO:`);
    console.log(`   ✅ Existem: ${existingTables.length} tabelas`);
    console.log(`   ❌ Faltam: ${missingTables.length} tabelas`);

    if (missingTables.length > 0) {
        console.log(`\n🔧 TABELAS FALTANDO:`);
        missingTables.forEach(table => console.log(`   - ${table}`));
    }

    // Verificar colunas específicas se as tabelas existem
    console.log('\n🔍 VERIFICANDO COLUNAS ESPECÍFICAS...');
    console.log('-'.repeat(40));

    const columnChecks = [
        { table: 'appointments', column: 'professional_id' },
        { table: 'professional_services', column: 'custom_price' },
        { table: 'professional_services', column: 'custom_duration' },
        { table: 'professional_availability_exceptions', column: 'description' },
        { table: 'professionals', column: 'working_hours' }
    ];

    for (const check of columnChecks) {
        if (existingTables.includes(check.table)) {
            const hasColumn = await checkColumnExists(check.table, check.column);
            console.log(`   ${hasColumn ? '✅' : '❌'} ${check.table}.${check.column}`);
        }
    }

    return { existingTables, missingTables };
}

// ==================== CORREÇÕES ====================

async function fixMissingTables() {
    console.log('\n🔧 APLICANDO CORREÇÕES NECESSÁRIAS...');
    console.log('-'.repeat(40));

    // 1. Criar tabela conversation_states se não existir
    const createConversationStates = `
        CREATE TABLE IF NOT EXISTS conversation_states (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            current_state TEXT DEFAULT 'idle',
            context JSONB DEFAULT '{}'::JSONB,
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(tenant_id, user_id)
        );
    `;

    // 2. Criar tabela professional_services se não existir
    const createProfessionalServices = `
        CREATE TABLE IF NOT EXISTS professional_services (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
            service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
            custom_price DECIMAL(10,2),
            custom_duration INTEGER,
            is_active BOOLEAN DEFAULT true,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(tenant_id, professional_id, service_id)
        );
    `;

    // 3. Criar tabela professional_availability_exceptions se não existir
    const createProfessionalExceptions = `
        CREATE TABLE IF NOT EXISTS professional_availability_exceptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            start_time TIME,
            end_time TIME,
            is_all_day BOOLEAN DEFAULT true,
            reason TEXT NOT NULL,
            description TEXT,
            is_recurring BOOLEAN DEFAULT false,
            recurrence_pattern JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT check_date_order CHECK (end_date >= start_date)
        );
    `;

    // 4. Adicionar colunas faltantes
    const addColumns = [
        `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS professional_id UUID REFERENCES professionals(id) ON DELETE SET NULL;`,
        `ALTER TABLE professionals ADD COLUMN IF NOT EXISTS working_hours JSONB DEFAULT '{}'::JSONB;`
    ];

    // 5. Criar índices
    const createIndexes = [
        `CREATE INDEX IF NOT EXISTS idx_conversation_states_tenant_user ON conversation_states(tenant_id, user_id);`,
        `CREATE INDEX IF NOT EXISTS idx_professional_services_professional ON professional_services(professional_id);`,
        `CREATE INDEX IF NOT EXISTS idx_professional_services_service ON professional_services(service_id);`,
        `CREATE INDEX IF NOT EXISTS idx_professional_exceptions_professional ON professional_availability_exceptions(professional_id);`,
        `CREATE INDEX IF NOT EXISTS idx_appointments_professional_id ON appointments(professional_id);`
    ];

    // 6. Triggers para updated_at
    const createTriggers = `
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DO $$ 
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_conversation_states_updated_at') THEN
                CREATE TRIGGER update_conversation_states_updated_at 
                    BEFORE UPDATE ON conversation_states
                    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_professional_services_updated_at') THEN
                CREATE TRIGGER update_professional_services_updated_at 
                    BEFORE UPDATE ON professional_services
                    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_professional_exceptions_updated_at') THEN
                CREATE TRIGGER update_professional_exceptions_updated_at 
                    BEFORE UPDATE ON professional_availability_exceptions
                    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
            END IF;
        END $$;
    `;

    // Executar correções
    const fixes = [
        { name: 'Criar conversation_states', sql: createConversationStates },
        { name: 'Criar professional_services', sql: createProfessionalServices },
        { name: 'Criar professional_availability_exceptions', sql: createProfessionalExceptions },
        { name: 'Adicionar colunas', sql: addColumns.join('\n') },
        { name: 'Criar índices', sql: createIndexes.join('\n') },
        { name: 'Criar triggers', sql: createTriggers }
    ];

    for (const fix of fixes) {
        console.log(`   🔧 ${fix.name}...`);
        const success = await executeSQLRaw(fix.sql);
        if (success) {
            console.log(`   ✅ ${fix.name} - OK`);
        } else {
            console.log(`   ⚠️ ${fix.name} - Erro (pode já existir)`);
        }
    }
}

// ==================== POPULAÇÃO SIMPLIFICADA ====================

async function populateTablesSimplified() {
    console.log('\n🎯 POPULANDO TABELAS (VERSÃO SIMPLIFICADA)...');
    console.log('-'.repeat(40));

    try {
        // Buscar dados existentes
        const [tenantsResult, usersResult, professionalsResult, servicesResult, userTenantsResult] = await Promise.all([
            supabase.from('tenants').select('id, name'),
            supabase.from('users').select('id, name'),
            supabase.from('professionals').select('id, tenant_id, name'),
            supabase.from('services').select('id, tenant_id, name, base_price, duration_minutes'),
            supabase.from('user_tenants').select('user_id, tenant_id')
        ]);

        const tenants = tenantsResult.data || [];
        const users = usersResult.data || [];
        const professionals = professionalsResult.data || [];
        const services = servicesResult.data || [];
        const userTenants = userTenantsResult.data || [];

        console.log(`   📊 Dados encontrados: ${tenants.length} tenants, ${users.length} usuários, ${professionals.length} profissionais, ${services.length} serviços`);

        if (tenants.length === 0) {
            console.log('   ⚠️ Nenhum tenant encontrado. Execute primeiro populate-test-data.js');
            return;
        }

        // 1. Popular conversation_states
        console.log('\n   💬 Populando conversation_states...');
        const conversationStates = [];
        
        for (const userTenant of userTenants.slice(0, 10)) { // Apenas 10 para teste
            conversationStates.push({
                tenant_id: userTenant.tenant_id,
                user_id: userTenant.user_id,
                current_state: ['idle', 'booking', 'confirming'][Math.floor(Math.random() * 3)],
                context: { session_id: `session_${Date.now()}_${Math.random()}` },
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            });
        }

        if (conversationStates.length > 0) {
            const { error } = await supabase
                .from('conversation_states')
                .upsert(conversationStates, { onConflict: 'tenant_id,user_id' });
            
            if (error) {
                console.log(`   ⚠️ Erro ao popular conversation_states: ${error.message}`);
            } else {
                console.log(`   ✅ ${conversationStates.length} estados de conversa criados`);
            }
        }

        // 2. Popular professional_services
        console.log('\n   🔗 Populando professional_services...');
        const professionalServices = [];
        
        for (const professional of professionals) {
            const tenantServices = services.filter(s => s.tenant_id === professional.tenant_id);
            
            for (const service of tenantServices.slice(0, 2)) { // Máximo 2 serviços por profissional
                professionalServices.push({
                    tenant_id: professional.tenant_id,
                    professional_id: professional.id,
                    service_id: service.id,
                    custom_price: service.base_price ? service.base_price * (0.9 + Math.random() * 0.2) : null,
                    is_active: true
                });
            }
        }

        if (professionalServices.length > 0) {
            const { error } = await supabase
                .from('professional_services')
                .upsert(professionalServices, { onConflict: 'tenant_id,professional_id,service_id' });
            
            if (error) {
                console.log(`   ⚠️ Erro ao popular professional_services: ${error.message}`);
            } else {
                console.log(`   ✅ ${professionalServices.length} associações profissional-serviço criadas`);
            }
        }

        // 3. Popular professional_availability_exceptions
        console.log('\n   📅 Populando professional_availability_exceptions...');
        const exceptions = [];
        
        for (const professional of professionals) {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() + Math.floor(Math.random() * 30) + 1);
            
            exceptions.push({
                tenant_id: professional.tenant_id,
                professional_id: professional.id,
                start_date: startDate.toISOString().split('T')[0],
                end_date: startDate.toISOString().split('T')[0],
                is_all_day: true,
                reason: ['vacation', 'training', 'personal'][Math.floor(Math.random() * 3)],
                description: `Exceção para ${professional.name}`
            });
        }

        if (exceptions.length > 0) {
            const { error } = await supabase
                .from('professional_availability_exceptions')
                .insert(exceptions);
            
            if (error) {
                console.log(`   ⚠️ Erro ao popular professional_availability_exceptions: ${error.message}`);
            } else {
                console.log(`   ✅ ${exceptions.length} exceções de disponibilidade criadas`);
            }
        }

        console.log('\n🎉 POPULAÇÃO CONCLUÍDA COM SUCESSO!');

    } catch (error) {
        console.error('❌ Erro durante população:', error.message);
    }
}

// ==================== EXECUÇÃO PRINCIPAL ====================

async function main() {
    try {
        const { existingTables, missingTables } = await diagnoseDatabase();
        
        if (missingTables.length > 0) {
            await fixMissingTables();
        }
        
        await populateTablesSimplified();
        
        console.log('\n✅ PROCESSO CONCLUÍDO!');
        console.log('📋 Banco de dados diagnosticado, corrigido e populado com sucesso.');
        
    } catch (error) {
        console.error('❌ Erro geral:', error.message);
    }
}

main(); 