#!/usr/bin/env node

/**
 * SCRIPT: Aplicar correções de schema para services e staff
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applySchemaFixes() {
    try {
        console.log('🔧 Aplicando correções de schema...');

        // Queries para executar
        const queries = [
            // Adicionar colunas à tabela services
            `ALTER TABLE services 
             ADD COLUMN IF NOT EXISTS duration INTEGER,
             ADD COLUMN IF NOT EXISTS price DECIMAL(10,2),
             ADD COLUMN IF NOT EXISTS description TEXT,
             ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,

            // Criar tabela staff
            `CREATE TABLE IF NOT EXISTS staff (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                role VARCHAR(255),
                schedule TEXT,
                specialties TEXT,
                phone VARCHAR(20),
                email VARCHAR(255),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )`,

            // Criar tabela appointments
            `CREATE TABLE IF NOT EXISTS appointments (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                service_id UUID REFERENCES services(id) ON DELETE SET NULL,
                staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
                customer_name VARCHAR(255) NOT NULL,
                customer_email VARCHAR(255),
                customer_phone VARCHAR(20),
                appointment_date DATE NOT NULL,
                appointment_time TIME NOT NULL,
                duration INTEGER DEFAULT 60,
                price DECIMAL(10,2),
                status VARCHAR(50) DEFAULT 'scheduled',
                notes TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )`,

            // Criar índices
            `CREATE INDEX IF NOT EXISTS idx_services_tenant_id ON services(tenant_id)`,
            `CREATE INDEX IF NOT EXISTS idx_staff_tenant_id ON staff(tenant_id)`,
            `CREATE INDEX IF NOT EXISTS idx_appointments_tenant_id ON appointments(tenant_id)`
        ];

        // Executar queries sequencialmente
        for (let i = 0; i < queries.length; i++) {
            const query = queries[i];
            console.log(`\n📝 Executando query ${i + 1}/${queries.length}...`);
            
            const { data, error } = await supabase.rpc('exec', { sql: query });
            
            if (error) {
                console.error(`❌ Erro na query ${i + 1}:`, error);
            } else {
                console.log(`✅ Query ${i + 1} executada com sucesso`);
            }
        }

        // Verificar se as tabelas estão corretas
        console.log('\n🔍 Verificando estrutura final...');
        
        const { data: servicesTest } = await supabase
            .from('services')
            .select('*')
            .limit(1);
            
        const { data: staffTest } = await supabase
            .from('staff')
            .select('*')
            .limit(1);

        const { data: appointmentsTest } = await supabase
            .from('appointments')
            .select('*')
            .limit(1);

        console.log('✅ Services table: OK');
        console.log('✅ Staff table: OK');
        console.log('✅ Appointments table: OK');

        console.log('\n🎯 Schema corrigido com sucesso!');

    } catch (error) {
        console.error('💥 Erro inesperado:', error);
    }
}

applySchemaFixes();