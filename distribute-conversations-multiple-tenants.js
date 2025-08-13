const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function distributeConversations() {
    try {
        console.log('🎯 CRIANDO CONVERSAS PARA MÚLTIPLOS TENANTS\n');
        
        // Buscar tenants disponíveis
        const { data: tenants } = await supabase
            .from('tenants')
            .select('id, name, email, whatsapp_phone')
            .not('whatsapp_phone', 'is', null)
            .limit(5);
            
        if (!tenants || tenants.length === 0) {
            console.error('❌ Nenhum tenant encontrado');
            return;
        }
        
        console.log(`📋 Encontrados ${tenants.length} tenants:`);
        tenants.forEach((t, i) => {
            console.log(`  ${i + 1}. ${t.name} (${t.email})`);
        });
        
        // Buscar usuários disponíveis
        const { data: users } = await supabase
            .from('users')
            .select('id, phone, name')
            .limit(20);
            
        if (!users || users.length === 0) {
            console.error('❌ Nenhum usuário encontrado');
            return;
        }
        
        console.log(`\n👥 Encontrados ${users.length} usuários`);
        
        // Templates de conversa
        const conversationTemplates = [
            {
                user: "Olá! Gostaria de agendar um horário",
                system: "Olá! Claro, que tipo de serviço você precisa?"
            },
            {
                user: "Preciso de informações sobre preços",
                system: "Com certeza! Nossos preços variam conforme o serviço. Qual você tem interesse?"
            },
            {
                user: "Qual o horário de funcionamento?",
                system: "Funcionamos de segunda a sábado, das 8h às 18h."
            },
            {
                user: "Posso cancelar meu agendamento?",
                system: "Sim! Posso te ajudar com o cancelamento. Qual o horário do seu agendamento?"
            }
        ];
        
        // Gerar conversas para cada tenant
        const conversations = [];
        const conversationsPerTenant = 150;
        
        for (let tenantIndex = 0; tenantIndex < tenants.length; tenantIndex++) {
            const tenant = tenants[tenantIndex];
            
            console.log(`\n💬 Criando ${conversationsPerTenant} conversas para ${tenant.name}...`);
            
            for (let convIndex = 0; convIndex < conversationsPerTenant; convIndex++) {
                const user = users[Math.floor(Math.random() * users.length)];
                const template = conversationTemplates[Math.floor(Math.random() * conversationTemplates.length)];
                
                // Data da conversa (últimos 30 dias)
                const conversationDate = new Date();
                conversationDate.setDate(conversationDate.getDate() - Math.floor(Math.random() * 30));
                conversationDate.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60));
                
                const sessionId = `tenant_${tenantIndex}_conv_${convIndex}_${Date.now()}`;
                let currentTime = new Date(conversationDate);
                
                // Mensagem do usuário
                conversations.push({
                    tenant_id: tenant.id,
                    user_id: user.id,
                    content: template.user,
                    is_from_user: true,
                    message_type: 'text',
                    intent_detected: 'general_inquiry',
                    confidence_score: 0.85 + Math.random() * 0.1,
                    conversation_context: {
                        session_id: sessionId,
                        tenant_name: tenant.name,
                        step: 1
                    },
                    created_at: currentTime.toISOString(),
                    message_source: 'whatsapp'
                });
                
                // Resposta do sistema
                currentTime = new Date(currentTime.getTime() + (5 + Math.random() * 15) * 1000);
                conversations.push({
                    tenant_id: tenant.id,
                    user_id: user.id,
                    content: template.system,
                    is_from_user: false,
                    message_type: 'text',
                    intent_detected: 'general_inquiry',
                    confidence_score: 0.95 + Math.random() * 0.04,
                    conversation_context: {
                        session_id: sessionId,
                        tenant_name: tenant.name,
                        step: 2
                    },
                    created_at: currentTime.toISOString(),
                    tokens_used: Math.floor(template.system.length / 4),
                    api_cost_usd: 0.002,
                    model_used: 'gpt-3.5-turbo',
                    message_source: 'whatsapp',
                    processing_cost_usd: 0.001
                });
                
                if ((convIndex + 1) % 50 === 0) {
                    console.log(`  ✅ ${convIndex + 1}/${conversationsPerTenant} conversas geradas...`);
                }
            }
        }
        
        // Inserir conversas em lotes
        console.log(`\n📨 Inserindo ${conversations.length} mensagens...`);
        
        const batchSize = 100;
        for (let i = 0; i < conversations.length; i += batchSize) {
            const batch = conversations.slice(i, i + batchSize);
            
            const { error } = await supabase
                .from('conversation_history')
                .insert(batch);
                
            if (error) {
                console.error(`❌ Erro no lote ${Math.floor(i/batchSize) + 1}:`, error);
            } else {
                console.log(`✅ Lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(conversations.length/batchSize)} inserido`);
            }
        }
        
        // Verificar admin users para cada tenant
        console.log('\n🔑 CREDENCIAIS DE LOGIN POR TENANT:\n');
        
        for (const tenant of tenants) {
            const { data: adminUser } = await supabase
                .from('admin_users')
                .select('email, name, role')
                .eq('tenant_id', tenant.id)
                .eq('is_active', true)
                .limit(1)
                .single();
                
            console.log(`🏢 ${tenant.name}`);
            console.log(`   WhatsApp: ${tenant.whatsapp_phone}`);
            console.log(`   Conversas: ${conversationsPerTenant * 2} mensagens (${conversationsPerTenant} conversas)`);
            
            if (adminUser) {
                console.log(`   Login: ${adminUser.email}`);
                console.log(`   Senha: admin123`);
            } else {
                console.log(`   ⚠️  Admin não encontrado - criando...`);
                
                // Criar admin user para este tenant
                const { error } = await supabase
                    .from('admin_users')
                    .insert({
                        email: tenant.email,
                        password_hash: '$2b$10$nNZ3QNiZX2sGDNfkTQxHH.GsC7rZ9XkFzOoALJuOP6ZIVKF4jDu8K', // admin123
                        name: `Admin ${tenant.name}`,
                        role: 'tenant_admin',
                        tenant_id: tenant.id,
                        is_active: true
                    });
                    
                if (!error) {
                    console.log(`   ✅ Admin criado: ${tenant.email}`);
                    console.log(`   Senha: admin123`);
                } else {
                    console.log(`   ❌ Erro ao criar admin:`, error.message);
                }
            }
            console.log('');
        }
        
        console.log('🎉 DISTRIBUIÇÃO CONCLUÍDA!\n');
        console.log('📖 COMO TESTAR:');
        console.log('1. Acesse: http://localhost:3000/login.html');
        console.log('2. Use qualquer email de tenant acima');
        console.log('3. Senha: admin123');
        console.log('4. Vá em: Conversas');
        console.log(`5. Você verá as conversas específicas do tenant logado`);
        
    } catch (error) {
        console.error('❌ Erro geral:', error);
    }
}

distributeConversations();