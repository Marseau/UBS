/**
 * OBTER TOKEN DE ADMIN PARA TESTE
 */

require('dotenv').config();
const fetch = require('node-fetch');

async function getAdminToken() {
    console.log('🔑 OBTENDO TOKEN DE ADMIN');
    console.log('=' .repeat(60));
    
    try {
        const response = await fetch('http://localhost:3000/api/admin/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: process.env.ADMIN_EMAIL || 'admin@universalbooking.com',
                password: process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123'
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Login bem-sucedido!');
            console.log('\n📋 Token para usar nos testes:');
            console.log(data.token);
            console.log('\n💡 Use este token no arquivo test-business-analytics-endpoints.js');
            
            // Testar o token
            console.log('\n🧪 Testando o token...');
            const testResponse = await fetch('http://localhost:3000/api/admin/user-info', {
                headers: {
                    'Authorization': `Bearer ${data.token}`
                }
            });
            
            if (testResponse.ok) {
                const userInfo = await testResponse.json();
                console.log('✅ Token válido! Usuário:', userInfo.data?.name, '- Role:', userInfo.data?.role);
            } else {
                console.error('❌ Token inválido');
            }
            
        } else {
            const error = await response.text();
            console.error('❌ Erro no login:', error);
        }
        
    } catch (error) {
        console.error('💥 Erro:', error.message);
    }
}

getAdminToken();