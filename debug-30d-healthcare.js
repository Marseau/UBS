// Debug Script: Investigação da Falha 30d para Tenants Healthcare
// Data: 2025-08-10
// Foco: Centro Terapêutico e Clínica Mente Sã

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debug30dHealthcareFailure() {
    console.log('=== DEBUG 30D HEALTHCARE FAILURE ANALYSIS ===');
    console.log('Current Date:', new Date().toISOString());
    
    const healthcareTenantIds = [1754748774142, 1754760259082]; // Centro Terapêutico, Clínica Mente Sã
    const currentDate = new Date();
    const date7d = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const date30d = new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const date90d = new Date(currentDate.getTime() - 90 * 24 * 60 * 60 * 1000);
    
    console.log('7d Window:', date7d.toISOString(), 'to', currentDate.toISOString());
    console.log('30d Window:', date30d.toISOString(), 'to', currentDate.toISOString());
    console.log('90d Window:', date90d.toISOString(), 'to', currentDate.toISOString());
    console.log('');

    for (const tenantId of healthcareTenantIds) {
        console.log('======================================');
        console.log('TENANT ID:', tenantId);
        console.log('======================================');
        
        // =================================================================================
        // 1. VOLUME DE DADOS POR PERÍODO
        // =================================================================================
        
        console.log('\n--- DATA VOLUME COMPARISON ---');
        
        try {
            // Appointments volume
            const { data: appointments7d } = await supabase
                .from('appointments')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', date7d.toISOString())
                .lt('created_at', new Date(currentDate.getTime() + 24 * 60 * 60 * 1000).toISOString());
                
            const { data: appointments30d } = await supabase
                .from('appointments')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', date30d.toISOString())
                .lt('created_at', new Date(currentDate.getTime() + 24 * 60 * 60 * 1000).toISOString());
                
            const { data: appointments90d } = await supabase
                .from('appointments')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', date90d.toISOString())
                .lt('created_at', new Date(currentDate.getTime() + 24 * 60 * 60 * 1000).toISOString());
            
            console.log(`Appointments Volume - 7d: ${appointments7d?.length || 0}, 30d: ${appointments30d?.length || 0}, 90d: ${appointments90d?.length || 0}`);
            
            if ((appointments30d?.length || 0) === 0) {
                console.log('WARNING: No appointments found in 30d period!');
            }
            
        } catch (error) {
            console.error('Error fetching appointment volumes:', error.message);
        }
        
        // =================================================================================
        // 2. VERIFICAÇÃO DE DADOS PROBLEMÁTICOS (NULLS, JSONB MALFORMADO) - 30D
        // =================================================================================
        
        console.log('\n--- DATA QUALITY CHECK FOR 30D PERIOD ---');
        
        try {
            // Get all appointments in 30d period
            const { data: appointments30dFull, error } = await supabase
                .from('appointments')
                .select('id, status, created_at, service_ids, customer_phone')
                .eq('tenant_id', tenantId)
                .gte('created_at', date30d.toISOString())
                .lt('created_at', new Date(currentDate.getTime() + 24 * 60 * 60 * 1000).toISOString());
            
            if (error) {
                console.error('Error fetching 30d appointments:', error.message);
                continue;
            }
            
            if (!appointments30dFull || appointments30dFull.length === 0) {
                console.log('No appointments found in 30d period for quality check');
                continue;
            }
            
            // Analyze NULL values
            const nullStatus = appointments30dFull.filter(a => a.status === null).length;
            const nullServiceIds = appointments30dFull.filter(a => a.service_ids === null).length;
            const nullCustomerPhone = appointments30dFull.filter(a => a.customer_phone === null).length;
            
            console.log(`NULL Values in 30d - Status: ${nullStatus}, Service_IDs: ${nullServiceIds}, Customer_Phone: ${nullCustomerPhone}`);
            
            if (nullStatus > 0 || nullServiceIds > 0 || nullCustomerPhone > 0) {
                console.log('WARNING: Critical NULL values detected in 30d period!');
            }
            
            // Check for malformed JSONB in service_ids
            let malformedJsonb = 0;
            const sampleSize = Math.min(appointments30dFull.length, 100);
            
            for (let i = 0; i < sampleSize; i++) {
                const appointment = appointments30dFull[i];
                if (appointment.service_ids !== null) {
                    try {
                        JSON.parse(JSON.stringify(appointment.service_ids));
                    } catch (e) {
                        malformedJsonb++;
                        console.log(`Malformed JSONB detected in appointment ID ${appointment.id}: ${appointment.service_ids}`);
                    }
                }
            }
            
            console.log(`Malformed JSONB count in 30d sample: ${malformedJsonb}`);
            
        } catch (error) {
            console.error('Error in data quality check:', error.message);
        }
        
        // =================================================================================
        // 3. DETALHES ESPECÍFICOS DOS REGISTROS 30D
        // =================================================================================
        
        console.log('\n--- DETAILED 30D RECORDS ANALYSIS ---');
        
        try {
            const { data: sampleRecords, error } = await supabase
                .from('appointments')
                .select('id, status, created_at, service_ids')
                .eq('tenant_id', tenantId)
                .gte('created_at', date30d.toISOString())
                .lt('created_at', new Date(currentDate.getTime() + 24 * 60 * 60 * 1000).toISOString())
                .order('created_at', { ascending: false })
                .limit(5);
            
            if (error) {
                console.error('Error fetching sample records:', error.message);
                continue;
            }
            
            if (!sampleRecords || sampleRecords.length === 0) {
                console.log('No appointments found in 30d period for detailed analysis');
            } else {
                sampleRecords.forEach((record, index) => {
                    let serviceIdsStatus = 'NULL';
                    if (record.service_ids !== null) {
                        const serviceIdsStr = JSON.stringify(record.service_ids);
                        if (serviceIdsStr === '[]') serviceIdsStatus = 'EMPTY_ARRAY';
                        else if (serviceIdsStr === '{}') serviceIdsStatus = 'EMPTY_OBJECT';
                        else if (serviceIdsStr === 'null') serviceIdsStatus = 'NULL_JSONB';
                        else serviceIdsStatus = 'HAS_DATA';
                    }
                    
                    console.log(`Sample ${index + 1}: ID=${record.id}, Status=${record.status}, Date=${record.created_at}, ServiceIDsStatus=${serviceIdsStatus}`);
                });
            }
            
        } catch (error) {
            console.error('Error fetching sample records:', error.message);
        }
        
        // =================================================================================
        // 4. TESTE DA PROCEDURE ESPECÍFICA PARA 30D
        // =================================================================================
        
        console.log('\n--- TESTING 30D PROCEDURE LOGIC ---');
        
        let errorOccurred = false;
        
        try {
            // Test total appointments calculation
            const { data: totalAppointments, error: totalError } = await supabase
                .from('appointments')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', date30d.toISOString())
                .lt('created_at', new Date(currentDate.getTime() + 24 * 60 * 60 * 1000).toISOString());
            
            if (totalError) {
                console.log('ERROR calculating total appointments:', totalError.message);
                errorOccurred = true;
            } else {
                console.log(`30d Total Appointments: ${totalAppointments?.length || 0}`);
            }
            
        } catch (error) {
            console.log('ERROR calculating total appointments:', error.message);
            errorOccurred = true;
        }
        
        try {
            // Test confirmed appointments
            const { data: confirmedAppointments, error: confirmedError } = await supabase
                .from('appointments')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', date30d.toISOString())
                .lt('created_at', new Date(currentDate.getTime() + 24 * 60 * 60 * 1000).toISOString())
                .or('status.ilike.%confirmed%,status.ilike.%confirmado%');
            
            if (confirmedError) {
                console.log('ERROR calculating confirmed appointments:', confirmedError.message);
                errorOccurred = true;
            } else {
                console.log(`30d Confirmed Appointments: ${confirmedAppointments?.length || 0}`);
            }
            
        } catch (error) {
            console.log('ERROR calculating confirmed appointments:', error.message);
            errorOccurred = true;
        }
        
        try {
            // Test completed appointments
            const { data: completedAppointments, error: completedError } = await supabase
                .from('appointments')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', date30d.toISOString())
                .lt('created_at', new Date(currentDate.getTime() + 24 * 60 * 60 * 1000).toISOString())
                .or('status.ilike.%completed%,status.ilike.%concluído%,status.ilike.%concluido%,status.ilike.%finalizado%');
            
            if (completedError) {
                console.log('ERROR calculating completed appointments:', completedError.message);
                errorOccurred = true;
            } else {
                console.log(`30d Completed Appointments: ${completedAppointments?.length || 0}`);
            }
            
        } catch (error) {
            console.log('ERROR calculating completed appointments:', error.message);
            errorOccurred = true;
        }
        
        try {
            // Test cancelled appointments
            const { data: cancelledAppointments, error: cancelledError } = await supabase
                .from('appointments')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', date30d.toISOString())
                .lt('created_at', new Date(currentDate.getTime() + 24 * 60 * 60 * 1000).toISOString())
                .or('status.ilike.%cancelled%,status.ilike.%cancelado%');
            
            if (cancelledError) {
                console.log('ERROR calculating cancelled appointments:', cancelledError.message);
                errorOccurred = true;
            } else {
                console.log(`30d Cancelled Appointments: ${cancelledAppointments?.length || 0}`);
            }
            
        } catch (error) {
            console.log('ERROR calculating cancelled appointments:', error.message);
            errorOccurred = true;
        }
        
        // Test complex JSONB services calculation
        try {
            const { data: appointmentsWithServices, error: servicesError } = await supabase
                .from('appointments')
                .select('service_ids')
                .eq('tenant_id', tenantId)
                .gte('created_at', date30d.toISOString())
                .lt('created_at', new Date(currentDate.getTime() + 24 * 60 * 60 * 1000).toISOString())
                .not('service_ids', 'is', null);
            
            if (servicesError) {
                console.log('ERROR calculating services available:', servicesError.message);
                errorOccurred = true;
            } else {
                let servicesAvailable = 0;
                if (appointmentsWithServices) {
                    appointmentsWithServices.forEach(appointment => {
                        try {
                            const serviceIds = appointment.service_ids;
                            if (Array.isArray(serviceIds)) {
                                servicesAvailable += serviceIds.length;
                            }
                        } catch (e) {
                            console.log('Error processing service_ids for services count:', e.message);
                            errorOccurred = true;
                        }
                    });
                }
                console.log(`30d Services Available: ${servicesAvailable}`);
            }
            
        } catch (error) {
            console.log('ERROR calculating services available:', error.message);
            errorOccurred = true;
        }
        
        // Test conversation history
        try {
            const { data: conversations, error: convError } = await supabase
                .from('conversation_history')
                .select('message_content')
                .eq('tenant_id', tenantId)
                .gte('created_at', date30d.toISOString())
                .lt('created_at', new Date(currentDate.getTime() + 24 * 60 * 60 * 1000).toISOString());
            
            if (convError) {
                console.log('ERROR calculating avg conversation length:', convError.message);
                errorOccurred = true;
            } else {
                let avgConversationLength = 0;
                if (conversations && conversations.length > 0) {
                    const totalLength = conversations.reduce((sum, conv) => 
                        sum + (conv.message_content ? conv.message_content.length : 0), 0);
                    avgConversationLength = totalLength / conversations.length;
                }
                console.log(`30d Avg Conversation Length: ${Math.round(avgConversationLength * 100) / 100}`);
            }
            
        } catch (error) {
            console.log('ERROR calculating avg conversation length:', error.message);
            errorOccurred = true;
        }
        
        // Summary
        if (errorOccurred) {
            console.log(`CRITICAL: Errors detected in 30d calculation for tenant ${tenantId}!`);
        } else {
            console.log(`SUCCESS: All 30d metrics calculated without errors for tenant ${tenantId}`);
        }
        
        console.log('');
    }
    
    // =================================================================================
    // 5. COMPARAÇÃO DIRETA DE DADOS ENTRE PERÍODOS VIA RAW SQL
    // =================================================================================
    
    console.log('\n=== PERIOD COMPARISON VIA RAW SQL ===');
    
    try {
        const { data: periodComparison, error } = await supabase.rpc('execute_sql', {
            query: `
                WITH period_comparison AS (
                    SELECT 
                        a.tenant_id,
                        CASE 
                            WHEN a.created_at >= CURRENT_DATE - INTERVAL '7 days' THEN '7d'
                            WHEN a.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN '30d'
                            WHEN a.created_at >= CURRENT_DATE - INTERVAL '90 days' THEN '90d'
                            ELSE 'older'
                        END as period,
                        COUNT(*) as appointment_count,
                        COUNT(CASE WHEN service_ids IS NOT NULL THEN 1 END) as with_service_ids,
                        COUNT(CASE WHEN service_ids IS NULL THEN 1 END) as without_service_ids,
                        COUNT(CASE WHEN status IS NULL THEN 1 END) as null_status_count,
                        COUNT(DISTINCT status) as unique_statuses
                    FROM appointments a
                    WHERE a.tenant_id IN (1754748774142, 1754760259082)
                    AND a.created_at >= CURRENT_DATE - INTERVAL '90 days'
                    GROUP BY a.tenant_id, period
                )
                SELECT 
                    tenant_id,
                    period,
                    appointment_count,
                    with_service_ids,
                    without_service_ids,
                    null_status_count,
                    unique_statuses,
                    ROUND(100.0 * with_service_ids / NULLIF(appointment_count, 0), 2) as service_ids_percentage
                FROM period_comparison
                WHERE period IN ('7d', '30d', '90d')
                ORDER BY tenant_id, 
                    CASE period 
                        WHEN '7d' THEN 1 
                        WHEN '30d' THEN 2 
                        WHEN '90d' THEN 3 
                    END;
            `
        });
        
        if (error) {
            console.log('Error in period comparison:', error.message);
        } else {
            console.log('Period Comparison Results:');
            console.table(periodComparison);
        }
        
    } catch (error) {
        console.log('Error executing period comparison:', error.message);
        
        // Fallback: manual period comparison
        console.log('Executing fallback manual period comparison...');
        
        for (const tenantId of healthcareTenantIds) {
            try {
                // Get counts for each period
                const periods = [
                    { name: '7d', start: date7d },
                    { name: '30d', start: date30d },
                    { name: '90d', start: date90d }
                ];
                
                for (const period of periods) {
                    const { data, error } = await supabase
                        .from('appointments')
                        .select('id, service_ids, status')
                        .eq('tenant_id', tenantId)
                        .gte('created_at', period.start.toISOString())
                        .lt('created_at', new Date(currentDate.getTime() + 24 * 60 * 60 * 1000).toISOString());
                    
                    if (error) {
                        console.log(`Error fetching ${period.name} data for tenant ${tenantId}:`, error.message);
                    } else {
                        const appointmentCount = data?.length || 0;
                        const withServiceIds = data?.filter(a => a.service_ids !== null).length || 0;
                        const withoutServiceIds = appointmentCount - withServiceIds;
                        const nullStatusCount = data?.filter(a => a.status === null).length || 0;
                        const uniqueStatuses = new Set(data?.map(a => a.status).filter(s => s !== null)).size;
                        const serviceIdsPercentage = appointmentCount > 0 ? Math.round(100.0 * withServiceIds / appointmentCount * 100) / 100 : 0;
                        
                        console.log(`Tenant ${tenantId} - ${period.name}: Count=${appointmentCount}, WithServiceIds=${withServiceIds}, WithoutServiceIds=${withoutServiceIds}, NullStatus=${nullStatusCount}, UniqueStatuses=${uniqueStatuses}, ServiceIdsPercentage=${serviceIdsPercentage}%`);
                    }
                }
            } catch (error) {
                console.log(`Error in fallback comparison for tenant ${tenantId}:`, error.message);
            }
        }
    }
    
    console.log('\n=== END DEBUG ANALYSIS ===');
}

// Execute the debug function
debug30dHealthcareFailure().catch(console.error);