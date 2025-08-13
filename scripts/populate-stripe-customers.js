const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

// --- Configurações do seu Supabase ---
const supabaseUrl = 'https://qsdfyffuonywmtnlycri.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU';
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

async function main() {
    // 1. Buscar todos os tenants e usuários
    const { data: tenants, error: tenantsError } = await supabase.from('tenants').select('id');
    const { data: users, error: usersError } = await supabase.from('users').select('id');

    if (tenantsError || usersError) {
        console.error('Erro ao buscar tenants ou users:', tenantsError || usersError);
        return;
    }

    // 2. Para cada tenant, criar até 5 stripe_customers únicos (tenant_id, user_id)
    for (const tenant of tenants) {
        const usedUserIds = new Set();
        let count = 0;
        while (count < 5 && usedUserIds.size < users.length) {
            const user = getRandomElement(users);
            if (usedUserIds.has(user.id)) continue;
            usedUserIds.add(user.id);

            // Verifica se já existe esse par (tenant_id, user_id)
            const { data: existing, error: existError } = await supabase
                .from('stripe_customers')
                .select('id')
                .eq('tenant_id', tenant.id)
                .eq('user_id', user.id)
                .maybeSingle();

            if (existError) {
                console.error('Erro ao verificar duplicidade:', existError);
                continue;
            }
            if (existing) continue; // Já existe, pula

            const insert = {
                id: uuidv4(),
                tenant_id: tenant.id,
                user_id: user.id,
                stripe_customer_id: `cus_${uuidv4().slice(0, 8)}`,
                subscription_id: `sub_${uuidv4().slice(0, 8)}`,
                subscription_status: getRandomElement(['active', 'canceled', 'past_due']),
                subscription_data: { plan: getRandomElement(['basic', 'premium', 'pro']) }
            };

            const { error: insertError } = await supabase
                .from('stripe_customers')
                .insert([insert]);

            if (insertError) {
                console.error('Erro ao inserir stripe_customer:', insertError);
            } else {
                console.log(`Stripe customer criado para tenant ${tenant.id} e user ${user.id}`);
                count++;
            }
        }
    }

    console.log('População de stripe_customers finalizada!');
}

main();