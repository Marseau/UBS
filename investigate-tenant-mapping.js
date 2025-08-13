// Investigate Tenant ID Mapping and Table Structure
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigateTenantMapping() {
    console.log('=== TENANT MAPPING & TABLE STRUCTURE INVESTIGATION ===');
    
    // 1. Check what tables exist
    console.log('1. Checking available tables...');
    try {
        const { data: tables, error } = await supabase
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public')
            .order('table_name');
        
        if (error) {
            console.log('Cannot access information_schema, trying alternative approach...');
        } else {
            console.log('Available tables:');
            tables.forEach(table => console.log(`  - ${table.table_name}`));
        }
    } catch (error) {
        console.log('Error checking tables:', error.message);
    }
    
    // 2. Check tenants table
    console.log('\n2. Checking tenants table...');
    try {
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('*')
            .limit(5);
        
        if (error) {
            console.log('Error accessing tenants table:', error.message);
        } else {
            console.log('Sample tenants:');
            tenants?.forEach(tenant => {
                console.log(`  ID: ${tenant.id}, Name: ${tenant.name || tenant.business_name || 'N/A'}`);
            });
        }
    } catch (error) {
        console.log('Error checking tenants:', error.message);
    }
    
    // 3. Check tenant_platform_metrics table
    console.log('\n3. Checking tenant_platform_metrics table...');
    try {
        const { data: metrics, error } = await supabase
            .from('tenant_platform_metrics')
            .select('*')
            .limit(5);
        
        if (error) {
            console.log('Error accessing tenant_platform_metrics:', error.message);
        } else {
            console.log('Sample tenant metrics:');
            metrics?.forEach(metric => {
                console.log(`  Tenant ID: ${metric.tenant_id}, Period: ${metric.period_days}d, Date: ${metric.calculation_date}`);
            });
            
            if (metrics && metrics.length > 0) {
                console.log('\nFirst metric record structure:');
                Object.keys(metrics[0]).forEach(key => {
                    console.log(`  ${key}: ${typeof metrics[0][key]} (${metrics[0][key]})`);
                });
            }
        }
    } catch (error) {
        console.log('Error checking tenant_platform_metrics:', error.message);
    }
    
    // 4. Check platform_metrics table
    console.log('\n4. Checking platform_metrics table...');
    try {
        const { data: platformMetrics, error } = await supabase
            .from('platform_metrics')
            .select('*')
            .limit(3);
        
        if (error) {
            console.log('Error accessing platform_metrics:', error.message);
        } else {
            console.log('Sample platform metrics:');
            platformMetrics?.forEach(metric => {
                console.log(`  Date: ${metric.calculation_date}, Total Tenants: ${metric.total_active_tenants}`);
            });
        }
    } catch (error) {
        console.log('Error checking platform_metrics:', error.message);
    }
    
    // 5. Search for healthcare tenants by name
    console.log('\n5. Searching for healthcare tenants by name...');
    try {
        const searchTerms = ['Centro Terapêutico', 'Clínica Mente', 'Centro Terapeutico', 'Mente Sã'];
        
        for (const term of searchTerms) {
            const { data: foundTenants, error } = await supabase
                .from('tenants')
                .select('id, name, business_name')
                .or(`name.ilike.%${term}%,business_name.ilike.%${term}%`);
            
            if (!error && foundTenants && foundTenants.length > 0) {
                console.log(`Found tenants matching "${term}":`);
                foundTenants.forEach(tenant => {
                    console.log(`  ID: ${tenant.id}, Name: ${tenant.name || tenant.business_name}`);
                });
            }
        }
    } catch (error) {
        console.log('Error searching healthcare tenants:', error.message);
    }
    
    // 6. Check if there are any numeric tenant references
    console.log('\n6. Checking for numeric tenant references...');
    try {
        // Check if tenant_platform_metrics has any reference to numeric IDs
        const { data: numericRefs, error } = await supabase
            .from('tenant_platform_metrics')
            .select('tenant_id, platform_metrics')
            .limit(10);
        
        if (!error && numericRefs) {
            console.log('Checking platform_metrics field for numeric references:');
            numericRefs.forEach((ref, index) => {
                console.log(`  Record ${index + 1}: tenant_id=${ref.tenant_id}`);
                if (ref.platform_metrics && typeof ref.platform_metrics === 'object') {
                    console.log(`    platform_metrics keys:`, Object.keys(ref.platform_metrics));
                }
            });
        }
    } catch (error) {
        console.log('Error checking numeric references:', error.message);
    }
    
    // 7. Check the actual metrics calculation function
    console.log('\n7. Checking if there are stored procedures or functions...');
    try {
        const { data: functions, error } = await supabase
            .from('information_schema.routines')
            .select('routine_name, routine_type')
            .eq('routine_schema', 'public')
            .like('routine_name', '%tenant%');
        
        if (!error && functions) {
            console.log('Found tenant-related functions:');
            functions.forEach(func => {
                console.log(`  ${func.routine_name} (${func.routine_type})`);
            });
        }
    } catch (error) {
        console.log('Cannot access routines information');
    }
    
    // 8. Try to understand the 30d failure by checking recent metrics calculations
    console.log('\n8. Checking recent metrics calculations for pattern...');
    try {
        const { data: recentMetrics, error } = await supabase
            .from('tenant_platform_metrics')
            .select('tenant_id, period_days, calculation_date, total_appointments, services_available')
            .order('calculation_date', { ascending: false })
            .limit(20);
        
        if (!error && recentMetrics) {
            console.log('Recent metrics calculations:');
            recentMetrics.forEach(metric => {
                console.log(`  Tenant: ${metric.tenant_id.substring(0, 8)}..., Period: ${metric.period_days}d, Date: ${metric.calculation_date}, Appointments: ${metric.total_appointments}, Services: ${metric.services_available}`);
            });
            
            // Group by period to see pattern
            const periodGroups = {};
            recentMetrics.forEach(metric => {
                if (!periodGroups[metric.period_days]) {
                    periodGroups[metric.period_days] = [];
                }
                periodGroups[metric.period_days].push(metric);
            });
            
            console.log('\nMetrics grouped by period:');
            Object.keys(periodGroups).sort().forEach(period => {
                console.log(`  ${period}d: ${periodGroups[period].length} records`);
                
                // Check for failures (null or zero values that shouldn't be)
                const failures = periodGroups[period].filter(m => 
                    m.total_appointments === null || 
                    m.services_available === null ||
                    (m.total_appointments === 0 && m.services_available === 0)
                );
                
                if (failures.length > 0) {
                    console.log(`    Potential failures: ${failures.length} records`);
                    failures.forEach(failure => {
                        console.log(`      Tenant: ${failure.tenant_id.substring(0, 8)}..., Appointments: ${failure.total_appointments}, Services: ${failure.services_available}`);
                    });
                }
            });
        }
    } catch (error) {
        console.log('Error checking recent metrics:', error.message);
    }
}

investigateTenantMapping().catch(console.error);