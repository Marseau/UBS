const puppeteer = require('puppeteer');
const fetch = require('node-fetch');

async function verifyAdminRoutes() {
    console.log('🔍 Verifying Admin Routes and Authentication...');
    
    const baseUrl = 'http://localhost:3000';
    
    try {
        // Test direct endpoints
        console.log('\n📡 Testing API endpoints directly...');
        
        // Test admin login endpoint
        const loginResponse = await fetch(`${baseUrl}/api/admin/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@universalbooking.com', password: 'admin123' })
        });
        
        console.log(`Login endpoint status: ${loginResponse.status}`);
        const loginData = await loginResponse.json();
        console.log('Login response:', loginData);
        
        if (loginData.success) {
            const token = loginData.token;
            console.log(`✅ Got auth token: ${token.substring(0, 50)}...`);
            
            // Test protected endpoints with token
            const protectedEndpoints = [
                '/api/admin/dashboard/stats',
                '/api/admin/appointments',
                '/api/admin/customers',
                '/api/admin/services',
                '/api/admin/conversations',
                '/api/analytics/overview'
            ];
            
            console.log('\n🔒 Testing protected endpoints...');
            for (const endpoint of protectedEndpoints) {
                try {
                    const response = await fetch(`${baseUrl}${endpoint}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    console.log(`${endpoint}: ${response.status} ${response.ok ? '✅' : '❌'}`);
                } catch (e) {
                    console.log(`${endpoint}: ERROR ${e.message} ❌`);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Direct endpoint test failed:', error.message);
    }
    
    // Test with browser
    console.log('\n🌐 Testing with browser...');
    
    const browser = await puppeteer.launch({ 
        headless: false, 
        defaultViewport: { width: 1400, height: 900 }
    });
    
    const page = await browser.newPage();
    
    // Monitor console logs
    page.on('console', msg => {
        console.log(`BROWSER: ${msg.text()}`);
    });
    
    // Monitor network requests
    page.on('request', request => {
        if (request.url().includes('/api/')) {
            console.log(`REQUEST: ${request.method()} ${request.url()}`);
        }
    });
    
    page.on('response', response => {
        if (response.url().includes('/api/')) {
            console.log(`RESPONSE: ${response.status()} ${response.url()}`);
        }
    });
    
    try {
        // 1. Test /admin route
        console.log('\n📄 Testing /admin route...');
        await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle2' });
        await page.waitForTimeout(3000);
        
        const currentUrl = page.url();
        console.log(`Current URL after /admin: ${currentUrl}`);
        
        // Check what page loaded
        const title = await page.title();
        console.log(`Page title: ${title}`);
        
        // Look for login form or dashboard elements
        const hasLoginForm = await page.$('#login-form') !== null;
        const hasEmailField = await page.$('#email') !== null;
        const hasDashboard = await page.$('.main-content') !== null;
        
        console.log(`Has login form: ${hasLoginForm}`);
        console.log(`Has email field: ${hasEmailField}`);
        console.log(`Has dashboard: ${hasDashboard}`);
        
        if (hasLoginForm && hasEmailField) {
            console.log('\n🔐 Login form detected, testing login...');
            
            // Test login
            await page.type('#email', 'admin@universalbooking.com');
            await page.type('#password', 'admin123');
            
            // Click submit
            await page.click('button[type="submit"]');
            await page.waitForTimeout(5000);
            
            const afterLoginUrl = page.url();
            console.log(`URL after login: ${afterLoginUrl}`);
            
            // Check if redirected to dashboard
            const token = await page.evaluate(() => localStorage.getItem('adminToken'));
            console.log(`Token in localStorage: ${token ? 'Yes' : 'No'}`);
            
            if (token) {
                console.log('✅ Login successful!');
                
                // Test navigation to different pages
                const pages = [
                    '/dashboard-standardized.html',
                    '/appointments-standardized.html',
                    '/customers-standardized.html',
                    '/services-standardized.html',
                    '/conversations-standardized.html'
                ];
                
                for (const testPage of pages) {
                    console.log(`\n📄 Testing page: ${testPage}`);
                    try {
                        await page.goto(`${baseUrl}${testPage}`, { waitUntil: 'networkidle2' });
                        await page.waitForTimeout(2000);
                        
                        const pageTitle = await page.title();
                        const hasContent = await page.$('.main-content') !== null;
                        
                        console.log(`  Title: ${pageTitle}`);
                        console.log(`  Has content: ${hasContent ? '✅' : '❌'}`);
                        
                        // Check if auth is maintained
                        const currentToken = await page.evaluate(() => localStorage.getItem('adminToken'));
                        console.log(`  Token maintained: ${currentToken ? '✅' : '❌'}`);
                        
                    } catch (e) {
                        console.log(`  Error loading page: ${e.message} ❌`);
                    }
                }
            } else {
                console.log('❌ Login failed - no token found');
            }
            
        } else {
            console.log('⚠️ No login form found');
        }
        
    } catch (error) {
        console.error('❌ Browser test failed:', error.message);
    }
    
    await browser.close();
    console.log('\n✅ Route verification completed');
}

// Run verification
verifyAdminRoutes().catch(console.error);