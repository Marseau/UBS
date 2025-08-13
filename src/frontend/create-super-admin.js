const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

// --- Cole aqui as suas credenciais do Supabase ---
const supabaseUrl = 'https://qsdfyffuonywmtnlycri.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU';
// ----------------------------------------------------

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createSuperAdmin() {
    console.log('--- Iniciando criação/atualização do Super Admin ---');

    const adminEmail = 'admin@universalbooking.com';
    const adminPassword = '12345678'; // A senha que vamos usar

    // 1. Gerar o hash da senha usando bcryptjs, a mesma biblioteca do seu backend.
    const passwordHash = bcrypt.hashSync(adminPassword, 10);
    console.log(`Senha: ${adminPassword}`);
    console.log(`Hash gerado: ${passwordHash}`);

    const adminData = {
        email: adminEmail,
        password_hash: passwordHash,
        name: 'Super Administrador',
        role: 'super_admin',
        is_active: true,
        tenant_id: null
    };

    // 2. Usar 'upsert' para criar o usuário se ele não existir,
    // ou ATUALIZAR se já existir (garantindo que o hash esteja correto).
    // O 'onConflict' garante que a busca seja feita pelo email.
    const { data, error } = await supabase
        .from('admin_users')
        .upsert(adminData, { onConflict: 'email' })
        .select();

    if (error) {
        console.error('\n❌ ERRO ao criar/atualizar o Super Admin:', error);
        return;
    }

    console.log('\n✅ SUCESSO! Super Admin criado/atualizado com os dados corretos:');
    console.log(data);
    console.log('\nAgora você pode fazer login com:');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Senha: ${adminPassword}`);
    console.log('----------------------------------------------------');
}

createSuperAdmin();