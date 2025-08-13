const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function atualizarSenhaAdmin() {
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );

    const novoHash = '$2b$10$HjHDGC6OhJg8YcdWBfNwCudFoaHvG8AxddGlarGwPbk4SwtpSeCBi';
    
    console.log('🔧 Atualizando senha do super admin...');
    
    const { data, error } = await supabase
        .from('admin_users')
        .update({ password_hash: novoHash })
        .eq('email', 'admin@universalbooking.com')
        .select();
        
    if (error) {
        console.log('❌ Erro ao atualizar:', error.message);
    } else {
        console.log('✅ Senha atualizada com sucesso!');
        console.log('📧 Email:', data[0].email);
        console.log('🔑 Role:', data[0].role);
        console.log('🔐 Nova senha: Admin123');
    }
}

atualizarSenhaAdmin().catch(console.error);