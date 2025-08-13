const { chromium } = require('playwright');
const path = require('path');

async function testDashboardScreenshot() {
    console.log('🚀 Starting dashboard screenshot test...');
    
    const browser = await chromium.launch({ 
        headless: false,
        slowMo: 1000 // Slow down for visual inspection
    });
    
    try {
        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 }
        });
        
        const page = await context.newPage();
        
        // Collect console logs
        const consoleLogs = [];
        page.on('console', msg => {
            const type = msg.type();
            const text = msg.text();
            consoleLogs.push({ type, text });
            console.log(`📋 Console [${type}]: ${text}`);
        });
        
        // Collect network errors
        const networkErrors = [];
        page.on('response', response => {
            if (!response.ok()) {
                networkErrors.push({
                    url: response.url(),
                    status: response.status(),
                    statusText: response.statusText()
                });
                console.log(`❌ Network Error: ${response.status()} - ${response.url()}`);
            }
        });
        
        console.log('🌐 Navigating to dashboard...');
        
        // Navigate to the dashboard
        await page.goto('http://localhost:3000/dashboard-standardized.html', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        
        console.log('⏳ Waiting for page to load completely...');
        
        // Wait for the main container to be visible
        await page.waitForSelector('.container-fluid', { timeout: 10000 });
        
        // Wait for widgets to potentially load
        await page.waitForTimeout(5000);
        
        // Check if we're redirected to login
        const currentUrl = page.url();
        console.log(`📍 Current URL: ${currentUrl}`);
        
        if (currentUrl.includes('login') || currentUrl.includes('auth')) {
            console.log('🔐 Redirected to login page - authentication required');
            
            // Take screenshot of login page
            const loginScreenshotPath = path.join(__dirname, 'dashboard-login-redirect.png');
            await page.screenshot({ 
                path: loginScreenshotPath, 
                fullPage: true 
            });
            console.log(`📸 Login redirect screenshot saved: ${loginScreenshotPath}`);
            
            return;
        }
        
        // Wait for potential widget loading
        console.log('🔄 Waiting for widgets to load...');
        await page.waitForTimeout(3000);
        
        // Check for specific dashboard elements
        const dashboardElements = await page.evaluate(() => {
            const elements = {
                hasContainer: !!document.querySelector('.container-fluid'),
                hasWidgets: document.querySelectorAll('.widget, .card, .stat-card').length,
                hasCharts: document.querySelectorAll('canvas, .chart-container').length,
                hasDataLoading: document.querySelectorAll('.loading, .spinner').length,
                hasErrors: document.querySelectorAll('.error, .alert-danger').length,
                totalElements: document.querySelectorAll('*').length
            };
            
            // Get text content of key areas
            const mainContent = document.querySelector('main, .main-content, .container-fluid');
            elements.mainContentText = mainContent ? mainContent.textContent.substring(0, 200) : 'No main content found';
            
            return elements;
        });
        
        console.log('📊 Dashboard elements found:');
        console.log(`  - Container: ${dashboardElements.hasContainer}`);
        console.log(`  - Widgets: ${dashboardElements.hasWidgets}`);
        console.log(`  - Charts: ${dashboardElements.hasCharts}`);
        console.log(`  - Loading indicators: ${dashboardElements.hasDataLoading}`);
        console.log(`  - Error indicators: ${dashboardElements.hasErrors}`);
        console.log(`  - Total elements: ${dashboardElements.totalElements}`);
        console.log(`  - Main content preview: ${dashboardElements.mainContentText}`);
        
        // Take full page screenshot
        const screenshotPath = path.join(__dirname, 'dashboard-screenshot.png');
        await page.screenshot({ 
            path: screenshotPath, 
            fullPage: true 
        });
        
        console.log(`📸 Dashboard screenshot saved: ${screenshotPath}`);
        
        // Take a viewport screenshot as well
        const viewportScreenshotPath = path.join(__dirname, 'dashboard-viewport-screenshot.png');
        await page.screenshot({ 
            path: viewportScreenshotPath, 
            fullPage: false 
        });
        
        console.log(`📸 Viewport screenshot saved: ${viewportScreenshotPath}`);
        
        // Summary report
        console.log('\n📋 SUMMARY REPORT:');
        console.log(`✅ Console logs: ${consoleLogs.length} messages`);
        console.log(`❌ Network errors: ${networkErrors.length} failed requests`);
        console.log(`🎯 Dashboard widgets: ${dashboardElements.hasWidgets} found`);
        console.log(`📈 Charts: ${dashboardElements.hasCharts} found`);
        
        if (consoleLogs.length > 0) {
            console.log('\n📝 Console Log Summary:');
            const errorLogs = consoleLogs.filter(log => log.type === 'error');
            const warningLogs = consoleLogs.filter(log => log.type === 'warning');
            
            console.log(`  - Errors: ${errorLogs.length}`);
            console.log(`  - Warnings: ${warningLogs.length}`);
            console.log(`  - Other: ${consoleLogs.length - errorLogs.length - warningLogs.length}`);
            
            if (errorLogs.length > 0) {
                console.log('\n🚨 Error Details:');
                errorLogs.forEach((log, index) => {
                    console.log(`  ${index + 1}. ${log.text}`);
                });
            }
        }
        
        if (networkErrors.length > 0) {
            console.log('\n🌐 Network Error Details:');
            networkErrors.forEach((error, index) => {
                console.log(`  ${index + 1}. ${error.status} - ${error.url}`);
            });
        }
        
    } catch (error) {
        console.error('💥 Error during dashboard test:', error.message);
        
        // Try to take a screenshot even on error
        try {
            const page = await browser.newPage();
            await page.goto('http://localhost:3000/dashboard-standardized.html');
            await page.screenshot({ 
                path: path.join(__dirname, 'dashboard-error-screenshot.png'), 
                fullPage: true 
            });
            console.log('📸 Error screenshot saved');
        } catch (screenshotError) {
            console.error('Failed to take error screenshot:', screenshotError.message);
        }
    } finally {
        await browser.close();
        console.log('✅ Browser closed');
    }
}

// Run the test
testDashboardScreenshot().catch(console.error);