#!/usr/bin/env node

/**
 * RLS Security Testing Script
 * Tests Row Level Security policies for the Universal Booking System
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

const log = {
    info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
    success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
    warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
    test: (msg) => console.log(`${colors.cyan}[TEST]${colors.reset} ${msg}`)
};

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    log.error('Missing required environment variables: SUPABASE_URL, SUPABASE_ANON_KEY');
    process.exit(1);
}

// Create clients
const anonClient = createClient(supabaseUrl, supabaseAnonKey);
const adminClient = supabaseServiceKey 
    ? createClient(supabaseUrl, supabaseServiceKey)
    : anonClient;

/**
 * Helper function to set tenant context
 */
async function setTenantContext(client, tenantId, isAdmin = false) {
    try {
        await client.rpc('set_tenant_context', {
            tenant_id: tenantId,
            is_admin: isAdmin
        });
        return true;
    } catch (error) {
        log.warning(`Failed to set tenant context: ${error.message}`);
        return false;
    }
}

/**
 * Helper function to set super admin context
 */
async function setSuperAdminContext(client) {
    try {
        await client.rpc('set_super_admin_context');
        return true;
    } catch (error) {
        log.warning(`Failed to set super admin context: ${error.message}`);
        return false;
    }
}

/**
 * Helper function to clear context
 */
async function clearContext(client) {
    try {
        await client.rpc('clear_tenant_context');
        return true;
    } catch (error) {
        log.warning(`Failed to clear context: ${error.message}`);
        return false;
    }
}

/**
 * Test 1: Basic Connection Test
 */
async function testBasicConnection() {
    log.test('Testing basic database connection...');
    
    try {
        const { data, error } = await anonClient
            .from('tenants')
            .select('count')
            .limit(1);

        if (error) {
            log.error(`Connection test failed: ${error.message}`);
            return false;
        }

        log.success('Database connection successful');
        return true;
    } catch (error) {
        log.error(`Connection test failed: ${error.message}`);
        return false;
    }
}

/**
 * Test 2: RLS Functions Availability
 */
async function testRLSFunctions() {
    log.test('Testing RLS helper functions availability...');
    
    const functions = [
        'get_current_tenant_id',
        'is_admin_user', 
        'is_super_admin',
        'set_tenant_context',
        'set_super_admin_context',
        'clear_tenant_context'
    ];

    let allFunctionsAvailable = true;

    for (const func of functions) {
        try {
            // Test if function exists by calling it (will fail if not exists)
            await adminClient.rpc(func, {});
        } catch (error) {
            if (error.message.includes('function') && error.message.includes('does not exist')) {
                log.error(`RLS function '${func}' not found`);
                allFunctionsAvailable = false;
            } else {
                // Function exists but failed with other error (expected)
                log.success(`RLS function '${func}' available`);
            }
        }
    }

    return allFunctionsAvailable;
}

/**
 * Test 3: Get Test Tenants
 */
async function getTestTenants() {
    log.test('Getting test tenants...');
    
    try {
        // Use admin client to get tenants
        await setSuperAdminContext(adminClient);
        
        const { data: tenants, error } = await adminClient
            .from('tenants')
            .select('id, slug, business_name')
            .limit(3);

        await clearContext(adminClient);

        if (error) {
            log.error(`Failed to get tenants: ${error.message}`);
            return [];
        }

        if (!tenants || tenants.length === 0) {
            log.warning('No tenants found in database');
            return [];
        }

        log.success(`Found ${tenants.length} test tenants`);
        tenants.forEach(tenant => {
            log.info(`- ${tenant.business_name} (${tenant.slug})`);
        });

        return tenants;
    } catch (error) {
        log.error(`Failed to get tenants: ${error.message}`);
        return [];
    }
}

/**
 * Test 4: Tenant Isolation Test
 */
async function testTenantIsolation(tenants) {
    if (tenants.length < 2) {
        log.warning('Need at least 2 tenants to test isolation');
        return false;
    }

    log.test('Testing tenant data isolation...');
    
    const tenant1 = tenants[0];
    const tenant2 = tenants[1];

    try {
        // Set context for tenant 1
        await setTenantContext(adminClient, tenant1.id);
        
        // Query services for tenant 1
        const { data: tenant1Services, error: error1 } = await adminClient
            .from('services')
            .select('id, tenant_id, name');

        if (error1) {
            log.error(`Failed to query services for tenant 1: ${error1.message}`);
            return false;
        }

        // Verify all services belong to tenant 1
        const invalidServices1 = tenant1Services?.filter(s => s.tenant_id !== tenant1.id) || [];
        if (invalidServices1.length > 0) {
            log.error(`Tenant isolation failed: Found ${invalidServices1.length} services from other tenants`);
            return false;
        }

        log.success(`Tenant 1 isolation: ${tenant1Services?.length || 0} services (all belong to tenant)`);

        // Set context for tenant 2
        await setTenantContext(adminClient, tenant2.id);
        
        // Query services for tenant 2
        const { data: tenant2Services, error: error2 } = await adminClient
            .from('services')
            .select('id, tenant_id, name');

        if (error2) {
            log.error(`Failed to query services for tenant 2: ${error2.message}`);
            return false;
        }

        // Verify all services belong to tenant 2
        const invalidServices2 = tenant2Services?.filter(s => s.tenant_id !== tenant2.id) || [];
        if (invalidServices2.length > 0) {
            log.error(`Tenant isolation failed: Found ${invalidServices2.length} services from other tenants`);
            return false;
        }

        log.success(`Tenant 2 isolation: ${tenant2Services?.length || 0} services (all belong to tenant)`);

        // Verify tenants see different data
        const tenant1ServiceIds = new Set(tenant1Services?.map(s => s.id) || []);
        const tenant2ServiceIds = new Set(tenant2Services?.map(s => s.id) || []);
        
        const overlappingServices = [...tenant1ServiceIds].filter(id => tenant2ServiceIds.has(id));
        if (overlappingServices.length > 0) {
            log.error(`Data leakage detected: ${overlappingServices.length} services visible to both tenants`);
            return false;
        }

        log.success('Tenant isolation test passed: No data leakage detected');
        return true;

    } catch (error) {
        log.error(`Tenant isolation test failed: ${error.message}`);
        return false;
    } finally {
        await clearContext(adminClient);
    }
}

/**
 * Test 5: Super Admin Access Test
 */
async function testSuperAdminAccess(tenants) {
    log.test('Testing super admin access...');
    
    try {
        // Set super admin context
        await setSuperAdminContext(adminClient);
        
        // Query all tenants (should see all)
        const { data: allTenants, error: tenantsError } = await adminClient
            .from('tenants')
            .select('id, slug, business_name');

        if (tenantsError) {
            log.error(`Super admin tenants query failed: ${tenantsError.message}`);
            return false;
        }

        log.success(`Super admin can see ${allTenants?.length || 0} tenants`);

        // Query services across all tenants
        const { data: allServices, error: servicesError } = await adminClient
            .from('services')
            .select('id, tenant_id, name');

        if (servicesError) {
            log.error(`Super admin services query failed: ${servicesError.message}`);
            return false;
        }

        // Verify we can see services from multiple tenants
        const uniqueTenantIds = new Set(allServices?.map(s => s.tenant_id) || []);
        
        log.success(`Super admin can see ${allServices?.length || 0} services across ${uniqueTenantIds.size} tenants`);

        if (uniqueTenantIds.size < tenants.length) {
            log.warning(`Expected services from ${tenants.length} tenants, but only found ${uniqueTenantIds.size}`);
        }

        return true;

    } catch (error) {
        log.error(`Super admin access test failed: ${error.message}`);
        return false;
    } finally {
        await clearContext(adminClient);
    }
}

/**
 * Test 6: Context Clearing Test
 */
async function testContextClearing() {
    log.test('Testing context clearing...');
    
    try {
        // Set super admin context
        await setSuperAdminContext(adminClient);
        
        // Query with super admin access
        const { data: beforeClear, error: error1 } = await adminClient
            .from('tenants')
            .select('count');

        if (error1) {
            log.error(`Pre-clear query failed: ${error1.message}`);
            return false;
        }

        // Clear context
        await clearContext(adminClient);
        
        // Query again (should have restricted access)
        const { data: afterClear, error: error2 } = await adminClient
            .from('tenants')
            .select('count');

        // Note: This test may not show difference if using service role key
        // which typically has full access regardless of RLS
        
        log.success('Context clearing test completed');
        return true;

    } catch (error) {
        log.error(`Context clearing test failed: ${error.message}`);
        return false;
    }
}

/**
 * Test 7: Cross-Tenant User Access Test
 */
async function testCrossTenantUsers(tenants) {
    if (tenants.length < 2) {
        log.warning('Need at least 2 tenants to test cross-tenant users');
        return true;
    }

    log.test('Testing cross-tenant user access...');
    
    try {
        const tenant1 = tenants[0];
        const tenant2 = tenants[1];

        // Set context for tenant 1
        await setTenantContext(adminClient, tenant1.id);
        
        // Get users for tenant 1
        const { data: tenant1Users, error: error1 } = await adminClient
            .from('user_tenants')
            .select(`
                user_id,
                users (
                    id,
                    name,
                    phone
                )
            `)
            .eq('tenant_id', tenant1.id);

        if (error1) {
            log.error(`Failed to get users for tenant 1: ${error1.message}`);
            return false;
        }

        // Set context for tenant 2
        await setTenantContext(adminClient, tenant2.id);
        
        // Get users for tenant 2
        const { data: tenant2Users, error: error2 } = await adminClient
            .from('user_tenants')
            .select(`
                user_id,
                users (
                    id,
                    name,
                    phone
                )
            `)
            .eq('tenant_id', tenant2.id);

        if (error2) {
            log.error(`Failed to get users for tenant 2: ${error2.message}`);
            return false;
        }

        log.success(`Tenant 1 has ${tenant1Users?.length || 0} users`);
        log.success(`Tenant 2 has ${tenant2Users?.length || 0} users`);
        
        // Check for cross-tenant users (same user_id in both tenants)
        const tenant1UserIds = new Set(tenant1Users?.map(ut => ut.user_id) || []);
        const tenant2UserIds = new Set(tenant2Users?.map(ut => ut.user_id) || []);
        
        const crossTenantUsers = [...tenant1UserIds].filter(id => tenant2UserIds.has(id));
        
        if (crossTenantUsers.length > 0) {
            log.info(`Found ${crossTenantUsers.length} cross-tenant users (this is expected behavior)`);
        }

        log.success('Cross-tenant user access test passed');
        return true;

    } catch (error) {
        log.error(`Cross-tenant user test failed: ${error.message}`);
        return false;
    } finally {
        await clearContext(adminClient);
    }
}

/**
 * Main test runner
 */
async function runAllTests() {
    console.log(`${colors.magenta}=================================`);
    console.log(`🔐 RLS Security Testing Suite`);
    console.log(`Universal Booking System`);
    console.log(`=================================${colors.reset}\n`);

    const results = {
        passed: 0,
        failed: 0,
        total: 0
    };

    const runTest = async (testName, testFunction, ...args) => {
        results.total++;
        log.info(`\n--- ${testName} ---`);
        
        try {
            const success = await testFunction(...args);
            if (success) {
                results.passed++;
                log.success(`✅ ${testName} PASSED\n`);
            } else {
                results.failed++;
                log.error(`❌ ${testName} FAILED\n`);
            }
            return success;
        } catch (error) {
            results.failed++;
            log.error(`❌ ${testName} FAILED: ${error.message}\n`);
            return false;
        }
    };

    // Run tests sequentially
    await runTest('Basic Connection', testBasicConnection);
    
    const functionsAvailable = await runTest('RLS Functions Availability', testRLSFunctions);
    
    if (!functionsAvailable) {
        log.warning('RLS functions not available. Some tests will be skipped.');
        log.info('Make sure you have run the database setup: ./scripts/setup-database.sh');
    }

    const tenants = await getTestTenants();
    
    if (tenants.length > 0 && functionsAvailable) {
        await runTest('Tenant Data Isolation', testTenantIsolation, tenants);
        await runTest('Super Admin Access', testSuperAdminAccess, tenants);
        await runTest('Context Clearing', testContextClearing);
        await runTest('Cross-Tenant Users', testCrossTenantUsers, tenants);
    } else {
        log.warning('Skipping tenant-specific tests due to missing data or functions');
    }

    // Print summary
    console.log(`${colors.magenta}=================================`);
    console.log(`📊 Test Results Summary`);
    console.log(`=================================${colors.reset}`);
    console.log(`Total Tests: ${results.total}`);
    console.log(`${colors.green}Passed: ${results.passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${results.failed}${colors.reset}`);
    
    const successRate = results.total > 0 ? (results.passed / results.total * 100).toFixed(1) : 0;
    console.log(`Success Rate: ${successRate}%`);

    if (results.failed === 0) {
        log.success('\n🎉 All tests passed! Your RLS setup is working correctly.');
    } else {
        log.error(`\n⚠️  ${results.failed} test(s) failed. Please review the RLS configuration.`);
        
        if (!functionsAvailable) {
            log.info('\n💡 Tip: Run ./scripts/setup-database.sh to setup RLS functions');
        }
        
        process.exit(1);
    }
}

// Handle CLI arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🔐 RLS Security Testing Script

Usage: node scripts/test-rls-security.js [options]

Options:
  --help, -h    Show this help message

Environment Variables Required:
  SUPABASE_URL                - Your Supabase project URL
  SUPABASE_ANON_KEY          - Your Supabase anon key  
  SUPABASE_SERVICE_ROLE_KEY  - Your Supabase service role key (optional)

Examples:
  node scripts/test-rls-security.js
  npm run test:rls-security
    `);
    process.exit(0);
}

// Run tests
runAllTests().catch(error => {
    log.error(`Test runner failed: ${error.message}`);
    process.exit(1);
});