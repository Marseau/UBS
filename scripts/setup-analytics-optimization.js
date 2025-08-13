#!/usr/bin/env node

/**
 * Setup Analytics Optimization Script
 * 
 * This script sets up the analytics optimization infrastructure:
 * 1. Creates aggregation tables
 * 2. Creates materialized views
 * 3. Sets up indexes
 * 4. Creates aggregation functions
 * 5. Provides sample data population
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupAnalyticsOptimization() {
    console.log('🚀 Setting up Analytics Optimization Infrastructure...');

    try {
        // Read the schema files
        const schemaPath = path.join(__dirname, '..', 'database', 'analytics-optimization-schema.sql');
        const jobTrackingPath = path.join(__dirname, '..', 'database', 'analytics-job-tracking-schema.sql');
        
        if (!fs.existsSync(schemaPath)) {
            console.error('❌ Schema file not found:', schemaPath);
            process.exit(1);
        }

        if (!fs.existsSync(jobTrackingPath)) {
            console.error('❌ Job tracking schema file not found:', jobTrackingPath);
            process.exit(1);
        }

        const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
        const jobTrackingSQL = fs.readFileSync(jobTrackingPath, 'utf8');
        const combinedSQL = schemaSQL + '\n\n' + jobTrackingSQL;
        
        console.log('⚡ Executing the entire analytics optimization schema...');

        // Execute the entire SQL script as a single command
        const { error } = await supabase.rpc('exec_sql', { sql_statement: combinedSQL });

        if (error) {
            console.error('❌ An error occurred during schema execution:', error);
            process.exit(1);
        }

        console.log('✅ Analytics schema executed successfully!');

        console.log('📊 Creating sample aggregated data...');
        await createSampleAggregatedData();

        console.log('🎉 Analytics optimization setup completed successfully!');
        console.log('\n📋 Next steps:');
        console.log('1. The analytics service has been updated to use optimized queries');
        console.log('2. Set up a cron job to run daily aggregations: aggregate_tenant_daily_metrics()');
        console.log('3. Set up a cron job to refresh materialized views: refresh_analytics_materialized_views()');
        console.log('4. Monitor query performance in production');

    } catch (error) {
        console.error('❌ Failed to setup analytics optimization:', error);
        process.exit(1);
    }
}

async function createSampleAggregatedData() {
    try {
        console.log('📈 Creating sample aggregated data for testing...');

        // Create sample system metrics for the last 30 days
        const today = new Date();
        const sampleData = [];

        for (let i = 29; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            // Generate realistic sample data
            const baseAppointments = Math.floor(50 + Math.random() * 100);
            const completionRate = 0.7 + Math.random() * 0.2; // 70-90%
            const avgTicket = 80 + Math.random() * 120; // R$ 80-200

            sampleData.push({
                metric_date: dateStr,
                period_type: 'daily',
                total_appointments: baseAppointments,
                confirmed_appointments: Math.floor(baseAppointments * 0.8),
                completed_appointments: Math.floor(baseAppointments * completionRate),
                cancelled_appointments: Math.floor(baseAppointments * 0.1),
                pending_appointments: Math.floor(baseAppointments * 0.1),
                completion_rate: Math.round(completionRate * 100 * 100) / 100,
                cancellation_rate: 10.0,
                total_revenue: Math.round(baseAppointments * completionRate * avgTicket * 100) / 100,
                completed_revenue: Math.round(baseAppointments * completionRate * avgTicket * 100) / 100,
                potential_revenue: Math.round(baseAppointments * avgTicket * 100) / 100,
                average_ticket: Math.round(avgTicket * 100) / 100,
                total_customers: Math.floor(baseAppointments * 0.6), // Some repeat customers
                new_customers: Math.floor(baseAppointments * 0.3),
                active_customers: Math.floor(baseAppointments * 0.6),
                total_ai_interactions: Math.floor(baseAppointments * 2.5), // Multiple interactions per appointment
                ai_responses: Math.floor(baseAppointments * 1.5),
                ai_bookings: Math.floor(baseAppointments * 0.4), // 40% of appointments via AI
                active_tenants: 5 + Math.floor(Math.random() * 10) // 5-15 active tenants
            });
        }

        // Insert sample system metrics
        const { error: systemError } = await supabase
            .from('analytics_system_metrics')
            .upsert(sampleData, { onConflict: 'metric_date,period_type' });

        if (systemError) {
            console.warn('⚠️ Warning inserting system metrics:', systemError.message);
        } else {
            console.log('✅ Sample system metrics created');
        }

        // Get some tenant IDs for sample tenant data
        const { data: tenants } = await supabase
            .from('tenants')
            .select('id')
            .eq('status', 'active')
            .limit(5);

        if (tenants && tenants.length > 0) {
            console.log(`📊 Creating sample tenant metrics for ${tenants.length} tenants...`);

            for (const tenant of tenants) {
                const tenantSampleData = sampleData.map(day => ({
                    ...day,
                    tenant_id: tenant.id,
                    // Scale down for individual tenants
                    total_appointments: Math.floor(day.total_appointments / 5),
                    confirmed_appointments: Math.floor(day.confirmed_appointments / 5),
                    completed_appointments: Math.floor(day.completed_appointments / 5),
                    cancelled_appointments: Math.floor(day.cancelled_appointments / 5),
                    pending_appointments: Math.floor(day.pending_appointments / 5),
                    total_revenue: Math.round(day.total_revenue / 5 * 100) / 100,
                    completed_revenue: Math.round(day.completed_revenue / 5 * 100) / 100,
                    potential_revenue: Math.round(day.potential_revenue / 5 * 100) / 100,
                    total_customers: Math.floor(day.total_customers / 5),
                    new_customers: Math.floor(day.new_customers / 5),
                    active_customers: Math.floor(day.active_customers / 5),
                    total_ai_interactions: Math.floor(day.total_ai_interactions / 5),
                    ai_responses: Math.floor(day.ai_responses / 5),
                    ai_bookings: Math.floor(day.ai_bookings / 5)
                }));

                const { error: tenantError } = await supabase
                    .from('analytics_tenant_metrics')
                    .upsert(tenantSampleData, { onConflict: 'tenant_id,metric_date,period_type' });

                if (tenantError) {
                    console.warn(`⚠️ Warning inserting tenant ${tenant.id} metrics:`, tenantError.message);
                } else {
                    console.log(`✅ Sample metrics created for tenant ${tenant.id}`);
                }
            }
        }

        console.log('🎯 Sample aggregated data creation completed');

    } catch (error) {
        console.error('❌ Failed to create sample data:', error);
    }
}

// Execute the setup
if (require.main === module) {
    setupAnalyticsOptimization().catch(console.error);
}

module.exports = { setupAnalyticsOptimization, createSampleAggregatedData };