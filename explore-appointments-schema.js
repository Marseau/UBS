/**
 * Explorar estrutura da tabela appointments
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Erro: Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function exploreAppointmentsSchema() {
    try {
        console.log('🔍 Explorando estrutura da tabela appointments...');
        
        // Buscar um registro de amostra para ver os campos
        const { data: sample, error } = await supabase
            .from('appointments')
            .select('*')
            .limit(1);
            
        if (error) {
            console.error('❌ Erro ao buscar appointments:', error.message);
            
            // Tentar outras tabelas relacionadas
            console.log('\n🔍 Verificando outras tabelas...');
            
            const tables = ['bookings', 'scheduled_appointments', 'appointment_requests', 'services', 'professionals'];
            
            for (const table of tables) {
                try {
                    const { data, error: tableError } = await supabase
                        .from(table)
                        .select('*')
                        .limit(1);
                        
                    if (!tableError && data && data.length > 0) {
                        console.log(`✅ Tabela ${table} encontrada:`);
                        console.log(`   Campos: ${Object.keys(data[0]).join(', ')}`);
                        console.log(`   Exemplo: ${JSON.stringify(data[0], null, 2)}`);
                    } else {
                        console.log(`❌ Tabela ${table}: ${tableError?.message || 'não encontrada'}`);
                    }
                } catch (e) {
                    console.log(`❌ Tabela ${table}: erro ao acessar`);
                }
            }
            
            return null;
        }
        
        if (!sample || sample.length === 0) {
            console.log('⚠️ Tabela appointments existe mas está vazia');
            return null;
        }
        
        console.log('✅ Estrutura da tabela appointments:');
        console.log(`   Campos disponíveis: ${Object.keys(sample[0]).join(', ')}`);
        console.log('\n📄 Exemplo de registro:');
        console.log(JSON.stringify(sample[0], null, 2));
        
        // Contar total de registros
        const { count } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true });
            
        console.log(`\n📊 Total de registros na tabela: ${count}`);
        
        // Verificar diferentes status
        const { data: statusData } = await supabase
            .from('appointments')
            .select('status')
            .not('status', 'is', null);
            
        if (statusData) {
            const statusCounts = {};
            statusData.forEach(row => {
                const status = row.status;
                statusCounts[status] = (statusCounts[status] || 0) + 1;
            });
            
            console.log('\n📊 Distribuição por status:');
            Object.keys(statusCounts).forEach(status => {
                console.log(`   ${status}: ${statusCounts[status]} appointments`);
            });
        }
        
        return sample[0];
        
    } catch (error) {
        console.error('❌ Erro na exploração:', error.message);
        throw error;
    }
}

async function main() {
    try {
        console.log('🔍 EXPLORAÇÃO DE SCHEMA - APPOINTMENTS');
        console.log('='.repeat(50));
        
        await exploreAppointmentsSchema();
        
    } catch (error) {
        console.error('\n💥 ERRO:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { exploreAppointmentsSchema };