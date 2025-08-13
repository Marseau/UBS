const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class RealPageMapper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.realPages = [];
        this.errors = [];
        this.baseUrl = 'http://localhost:3000';
    }

    async init() {
        console.log('🚀 Starting Real Page Mapper with Playwright...');
        this.browser = await chromium.launch({ headless: false });
        this.page = await this.browser.newPage();
        
        // Set viewport for consistent screenshots
        await this.page.setViewportSize({ width: 1920, height: 1080 });
        
        // Listen for console errors
        this.page.on('console', msg => {
            if (msg.type() === 'error') {
                console.log('❌ Console Error:', msg.text());
            }
        });
    }

    async testRoute(route, description = '') {
        try {
            console.log(`🔍 Testing route: ${route}`);
            
            const response = await this.page.goto(`${this.baseUrl}${route}`, {
                waitUntil: 'domcontentloaded',
                timeout: 10000
            });
            
            const status = response.status();
            const url = this.page.url();
            
            // Take screenshot
            const screenshotName = route.replace(/[\/\:]/g, '_') || 'homepage';
            await this.page.screenshot({
                path: `screenshots/${screenshotName}.png`,
                fullPage: true
            });
            
            // Get page title and visible text
            const title = await this.page.title();
            const bodyText = await this.page.evaluate(() => {
                return document.body ? document.body.innerText.substring(0, 500) : 'No body content';
            });
            
            // Check for specific UI elements
            const hasNavigation = await this.page.$('.sidebar, .navbar, nav') !== null;
            const hasForms = await this.page.$('form') !== null;
            const hasCharts = await this.page.$('canvas, .chart') !== null;
            const hasTables = await this.page.$('table, .table') !== null;
            
            // Get all links on the page
            const links = await this.page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('a[href]'));
                return anchors.map(a => ({
                    href: a.href,
                    text: a.innerText.trim().substring(0, 50)
                })).filter(link => !link.href.includes('http') || link.href.includes('localhost:3000'));
            });
            
            const pageInfo = {
                route,
                description,
                status,
                finalUrl: url,
                title,
                bodyText: bodyText.replace(/\n/g, ' ').trim(),
                hasNavigation,
                hasForms,
                hasCharts,
                hasTables,
                links: links.slice(0, 10), // Limit to first 10 links
                screenshot: `screenshots/${screenshotName}.png`,
                timestamp: new Date().toISOString(),
                isWorking: status >= 200 && status < 400 && !bodyText.includes('Cannot GET') && !bodyText.includes('Error')
            };
            
            if (pageInfo.isWorking) {
                this.realPages.push(pageInfo);
                console.log(`✅ Route ${route} is working (${status})`);
            } else {
                this.errors.push({ route, status, error: bodyText.substring(0, 100) });
                console.log(`❌ Route ${route} failed (${status})`);
            }
            
            return pageInfo;
            
        } catch (error) {
            console.log(`❌ Error testing ${route}:`, error.message);
            this.errors.push({ route, error: error.message });
            return null;
        }
    }

    async discoverRoutesFromIndex() {
        console.log('📋 Analyzing index.js for defined routes...');
        
        try {
            const indexPath = path.join(__dirname, 'src/index.js');
            if (fs.existsSync(indexPath)) {
                const indexContent = fs.readFileSync(indexPath, 'utf8');
                
                // Extract routes from Express app definitions
                const routeMatches = indexContent.match(/app\.(get|post|put|delete)\(['"`]([^'"`]+)['"`]/g);
                if (routeMatches) {
                    return routeMatches.map(match => {
                        const routeMatch = match.match(/['"`]([^'"`]+)['"`]/);
                        return routeMatch ? routeMatch[1] : null;
                    }).filter(Boolean);
                }
            }
        } catch (error) {
            console.log('⚠️ Could not analyze index.js:', error.message);
        }
        
        return [];
    }

    async discoverRoutesFromFrontend() {
        console.log('📁 Scanning frontend directory for HTML files...');
        
        const frontendDir = path.join(__dirname, 'src/frontend');
        const htmlFiles = [];
        
        if (fs.existsSync(frontendDir)) {
            const files = fs.readdirSync(frontendDir);
            files.forEach(file => {
                if (file.endsWith('.html')) {
                    const routeName = file.replace('.html', '');
                    htmlFiles.push(`/${routeName}`);
                }
            });
        }
        
        return htmlFiles;
    }

    async runCompleteMapping() {
        console.log('🎯 Starting complete page mapping...');
        
        // Create screenshots directory
        if (!fs.existsSync('screenshots')) {
            fs.mkdirSync('screenshots');
        }
        
        // Common routes to test
        const commonRoutes = [
            { route: '/', description: 'Homepage/Landing' },
            { route: '/login', description: 'Login Page' },
            { route: '/register', description: 'Registration Page' },
            { route: '/admin', description: 'Admin Dashboard' },
            { route: '/dashboard', description: 'Main Dashboard' },
            { route: '/dashboard-standardized', description: 'Super Admin Dashboard' },
            { route: '/dashboard-tenant-admin', description: 'Tenant Admin Dashboard' },
            { route: '/tenant-business-analytics', description: 'Tenant Business Analytics' },
            { route: '/appointments', description: 'Appointments Management' },
            { route: '/customers', description: 'Customer Management' },
            { route: '/services', description: 'Service Management' },
            { route: '/conversations', description: 'WhatsApp Conversations' },
            { route: '/analytics', description: 'Advanced Analytics' },
            { route: '/settings', description: 'System Settings' },
            { route: '/billing', description: 'Billing Management' },
            { route: '/super-admin-dashboard', description: 'Super Admin Platform View' }
        ];
        
        // Discover routes from code
        const codeRoutes = await this.discoverRoutesFromIndex();
        const frontendRoutes = await this.discoverRoutesFromFrontend();
        
        // Combine all routes
        const allRoutes = [
            ...commonRoutes,
            ...codeRoutes.map(route => ({ route, description: 'From index.js' })),
            ...frontendRoutes.map(route => ({ route, description: 'From frontend files' }))
        ];
        
        // Remove duplicates
        const uniqueRoutes = allRoutes.filter((route, index, self) => 
            index === self.findIndex(r => r.route === route.route)
        );
        
        console.log(`📊 Testing ${uniqueRoutes.length} unique routes...`);
        
        // Test each route
        for (const { route, description } of uniqueRoutes) {
            await this.testRoute(route, description);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between requests
        }
        
        // Generate comprehensive report
        await this.generateReport();
    }

    async generateReport() {
        console.log('📄 Generating comprehensive report...');
        
        const report = {
            metadata: {
                generated_at: new Date().toISOString(),
                total_routes_tested: this.realPages.length + this.errors.length,
                working_routes: this.realPages.length,
                failed_routes: this.errors.length,
                base_url: this.baseUrl
            },
            working_pages: this.realPages.map(page => ({
                route: page.route,
                description: page.description,
                title: page.title,
                status: page.status,
                has_navigation: page.hasNavigation,
                has_forms: page.hasForms,
                has_charts: page.hasCharts,
                has_tables: page.hasTables,
                screenshot: page.screenshot,
                preview_text: page.bodyText.substring(0, 200),
                discovered_links: page.links.length
            })),
            failed_routes: this.errors,
            page_categories: {
                authentication: this.realPages.filter(p => p.route.includes('login') || p.route.includes('register')),
                dashboards: this.realPages.filter(p => p.route.includes('dashboard') || p.route.includes('admin')),
                management: this.realPages.filter(p => p.route.includes('appointment') || p.route.includes('customer') || p.route.includes('service')),
                analytics: this.realPages.filter(p => p.route.includes('analytics') || p.route.includes('metric')),
                communication: this.realPages.filter(p => p.route.includes('conversation') || p.route.includes('whatsapp')),
                configuration: this.realPages.filter(p => p.route.includes('setting') || p.route.includes('billing'))
            },
            technical_analysis: {
                pages_with_charts: this.realPages.filter(p => p.hasCharts).length,
                pages_with_forms: this.realPages.filter(p => p.hasForms).length,
                pages_with_tables: this.realPages.filter(p => p.hasTables).length,
                pages_with_navigation: this.realPages.filter(p => p.hasNavigation).length
            }
        };
        
        // Save JSON report
        fs.writeFileSync('REAL_PAGES_MAPPING_REPORT.json', JSON.stringify(report, null, 2));
        
        // Generate Markdown report for PRP update
        const markdownReport = this.generateMarkdownReport(report);
        fs.writeFileSync('REAL_PAGES_ANALYSIS.md', markdownReport);
        
        console.log('✅ Reports generated:');
        console.log('📄 REAL_PAGES_MAPPING_REPORT.json - Complete JSON data');
        console.log('📄 REAL_PAGES_ANALYSIS.md - Analysis for PRP update');
        console.log(`📊 Summary: ${report.working_pages.length} working pages, ${report.failed_routes.length} errors`);
        
        return report;
    }

    generateMarkdownReport(report) {
        return `# Real Pages Analysis - Dynamic System Mapping

## 📊 Executive Summary

**Generated:** ${report.metadata.generated_at}  
**Total Routes Tested:** ${report.metadata.total_routes_tested}  
**Working Pages:** ${report.metadata.working_routes}  
**Failed Routes:** ${report.metadata.failed_routes}  

## ✅ Working Pages (${report.working_pages.length})

${report.working_pages.map(page => `
### ${page.route} - ${page.description}
- **Title:** ${page.title}
- **Status:** ${page.status}
- **Features:** ${page.has_forms ? '📝 Forms ' : ''}${page.has_charts ? '📊 Charts ' : ''}${page.has_tables ? '📋 Tables ' : ''}${page.has_navigation ? '🧭 Navigation' : ''}
- **Preview:** ${page.preview_text}...
- **Screenshot:** ${page.screenshot}
- **Links Found:** ${page.discovered_links}

`).join('')}

## ❌ Failed Routes (${report.failed_routes.length})

${report.failed_routes.map(error => `
- **${error.route}:** ${error.error || error.status}
`).join('')}

## 📂 Page Categories

### 🔐 Authentication (${report.page_categories.authentication.length})
${report.page_categories.authentication.map(p => `- ${p.route} (${p.title})`).join('\n')}

### 📊 Dashboards (${report.page_categories.dashboards.length})
${report.page_categories.dashboards.map(p => `- ${p.route} (${p.title})`).join('\n')}

### 🏢 Management (${report.page_categories.management.length})
${report.page_categories.management.map(p => `- ${p.route} (${p.title})`).join('\n')}

### 📈 Analytics (${report.page_categories.analytics.length})
${report.page_categories.analytics.map(p => `- ${p.route} (${p.title})`).join('\n')}

### 💬 Communication (${report.page_categories.communication.length})
${report.page_categories.communication.map(p => `- ${p.route} (${p.title})`).join('\n')}

### ⚙️ Configuration (${report.page_categories.configuration.length})
${report.page_categories.configuration.map(p => `- ${p.route} (${p.title})`).join('\n')}

## 🔧 Technical Analysis

- **Pages with Charts:** ${report.technical_analysis.pages_with_charts} (Need Chart.js integration)
- **Pages with Forms:** ${report.technical_analysis.pages_with_forms} (Need form validation APIs)  
- **Pages with Tables:** ${report.technical_analysis.pages_with_tables} (Need pagination APIs)
- **Pages with Navigation:** ${report.technical_analysis.pages_with_navigation} (Need routing logic)

## 🎯 PRP Update Requirements

Based on real page discovery, the PRP should include APIs for:

### 📋 CONFIRMED WORKING PAGES:
${report.working_pages.map(page => `- \`${page.route}\` → ${page.description}`).join('\n')}

### 🚨 CRITICAL GAPS IDENTIFIED:
${report.failed_routes.length > 0 ? 
    `Routes that need implementation:\n${report.failed_routes.map(error => `- \`${error.route}\` (${error.error})`).join('\n')}` : 
    'No critical gaps found - all routes working!'
}

### 📊 API REQUIREMENTS BY CATEGORY:
1. **Dashboard APIs:** ${report.page_categories.dashboards.length} pages need real-time data
2. **Management APIs:** ${report.page_categories.management.length} pages need CRUD operations  
3. **Analytics APIs:** ${report.page_categories.analytics.length} pages need metrics calculation
4. **Form Processing APIs:** ${report.technical_analysis.pages_with_forms} pages need validation endpoints

---

**This analysis provides the EXACT current state of the system for accurate PRP generation.**
`;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('🔚 Browser closed');
        }
    }
}

// Main execution
async function main() {
    const mapper = new RealPageMapper();
    
    try {
        await mapper.init();
        const report = await mapper.runCompleteMapping();
        
        console.log('\n🎉 REAL PAGE MAPPING COMPLETE!');
        console.log(`📊 Found ${report.working_pages.length} working pages`);
        console.log(`❌ Found ${report.failed_routes.length} failed routes`);
        console.log('📄 Reports saved for PRP update');
        
    } catch (error) {
        console.error('❌ Error during page mapping:', error);
    } finally {
        await mapper.close();
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = RealPageMapper;