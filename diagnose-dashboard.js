// Load environment variables for credentials
require('dotenv').config();

/**
 * Diagnóstico rápido do dashboard
 * Verifica se todas as APIs estão funcionando corretamente
 */

const https = require('https');
const http = require('http');

async function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        data: data ? JSON.parse(data) : null
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        data: data
                    });
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

async function diagnose() {
    console.log('🔍 Diagnóstico do Dashboard dashboard-standardized.html\n');
    
    try {
        // 1. Testar login
        console.log('1. Testando autenticação...');
        const loginResult = await makeRequest('http://localhost:3000/api/admin/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const loginData = JSON.stringify({
            email: process.env.ADMIN_EMAIL || 'admin@universalbooking.com',
            password: process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123'
        });
        
        const loginReq = new Promise((resolve, reject) => {
            const req = http.request('http://localhost:3000/api/admin/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(loginData)
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve({
                            status: res.statusCode,
                            data: JSON.parse(data)
                        });
                    } catch (e) {
                        resolve({
                            status: res.statusCode,
                            data: data
                        });
                    }
                });
            });
            req.on('error', reject);
            req.write(loginData);
            req.end();
        });
        
        const login = await loginReq;
        
        if (login.status === 200 && login.data.success) {
            console.log('✅ Login funcionando');
            console.log(`   Token: ${login.data.token.substring(0, 20)}...`);
            console.log(`   Usuário: ${login.data.user.name}`);
            console.log(`   Role: ${login.data.user.role}\n`);
            
            const token = login.data.token;
            
            // 2. Testar APIs do dashboard
            console.log('2. Testando APIs do dashboard...');
            
            const apis = [
                { name: 'KPIs', url: 'http://localhost:3000/api/super-admin/kpis' },
                { name: 'Revenue vs Usage', url: 'http://localhost:3000/api/super-admin/charts/revenue-vs-usage' },
                { name: 'Appointment Status', url: 'http://localhost:3000/api/super-admin/charts/appointment-status' },
                { name: 'Distortion', url: 'http://localhost:3000/api/super-admin/insights/distortion' },
                { name: 'Upsell', url: 'http://localhost:3000/api/super-admin/insights/upsell' }
            ];
            
            for (const api of apis) {
                try {
                    const result = await makeRequest(api.url, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    
                    if (result.status === 200 && result.data && result.data.success) {
                        console.log(`✅ ${api.name}: OK`);
                    } else {
                        console.log(`❌ ${api.name}: Status ${result.status}`);
                    }
                } catch (error) {
                    console.log(`❌ ${api.name}: Erro - ${error.message}`);
                }
            }
            
            // 3. Testar página HTML
            console.log('\n3. Testando página HTML...');
            
            try {
                const pageResult = await makeRequest('http://localhost:3000/dashboard-standardized.html');
                
                if (pageResult.status === 200) {
                    console.log('✅ Página HTML: Acessível');
                    
                    // Verificar se contém elementos essenciais
                    const content = pageResult.data;
                    const checks = [
                        { text: 'super-admin-dashboard.js', name: 'Script principal' },
                        { text: 'Chart.js', name: 'Biblioteca de gráficos' },
                        { text: 'Bootstrap', name: 'Framework CSS' },
                        { text: 'receitaUsoRatio', name: 'KPI Receita/Uso' },
                        { text: 'mrrPlatform', name: 'KPI MRR' },
                        { text: 'revenueVsUsageChart', name: 'Gráfico principal' }
                    ];
                    
                    checks.forEach(check => {
                        if (content.includes(check.text)) {
                            console.log(`   ✅ ${check.name}: Presente`);
                        } else {
                            console.log(`   ❌ ${check.name}: Ausente`);
                        }
                    });
                } else {
                    console.log(`❌ Página HTML: Status ${pageResult.status}`);
                }
            } catch (error) {
                console.log(`❌ Página HTML: Erro - ${error.message}`);
            }
            
            // 4. Verificar dados retornados
            console.log('\n4. Verificando dados dos KPIs...');
            
            try {
                const kpiResult = await makeRequest('http://localhost:3000/api/super-admin/kpis', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (kpiResult.status === 200 && kpiResult.data && kpiResult.data.success) {
                    const kpis = kpiResult.data.data.kpis;
                    console.log('   📊 KPIs disponíveis:');
                    console.log(`   - Receita/Uso: ${kpis.receitaUsoRatio?.formatted || 'N/A'}`);
                    console.log(`   - MRR: ${kpis.mrrPlatform?.formatted || 'N/A'}`);
                    console.log(`   - Tenants Ativos: ${kpis.activeTenants?.formatted || 'N/A'}`);
                    console.log(`   - Eficiência: ${kpis.operationalEfficiency?.formatted || 'N/A'}`);
                    
                    if (kpis.receitaUsoRatio?.value === 0) {
                        console.log('\n   ⚠️  Nota: Valores zerados podem indicar falta de dados de teste');
                    }
                } else {
                    console.log('   ❌ Erro ao obter KPIs');
                }
            } catch (error) {
                console.log(`   ❌ Erro ao verificar KPIs: ${error.message}`);
            }
            
        } else {
            console.log('❌ Login falhou');
            console.log(`   Status: ${login.status}`);
            console.log(`   Response: ${JSON.stringify(login.data, null, 2)}`);
        }
        
    } catch (error) {
        console.error('❌ Erro no diagnóstico:', error);
    }
    
    console.log('\n🎯 Diagnóstico concluído!');
    console.log('\n📝 Para testar manualmente:');
    console.log('1. Abra http://localhost:3000/login.html');
    console.log('2. Login: admin@universalbooking.com / admin123');
    console.log('3. Acesse http://localhost:3000/dashboard-standardized.html');
}

diagnose().catch(console.error);