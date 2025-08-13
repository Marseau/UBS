#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAndCleanDirtyRecords() {
    console.log('🗑️ Checking for DIRTY Records');
    console.log('=' .repeat(50));
    
    const { data, error } = await supabase
        .from('tenant_metrics')
        .select('metric_type, period, tenant_id, id')
        .order('metric_type', { ascending: true })
        .order('period', { ascending: true });
    
    if (error) {
        console.log('❌ Error:', error.message);
        return;
    }
    
    console.log('📊 CURRENT DATABASE STATUS:');
    const typeGroups = {};
    data.forEach(m => {
        typeGroups[m.metric_type] = (typeGroups[m.metric_type] || 0) + 1;
    });
    
    console.log('📈 Records by type:');
    Object.entries(typeGroups).forEach(([type, count]) => {
        const status = type !== 'consolidated' ? ' ❌ SUJEIRA' : ' ✅ CORRETO';
        console.log(`   ${type}: ${count} records${status}`);
    });
    
    console.log(`\n📋 Total: ${data.length} records (should be exactly 30)`);
    
    // Find dirty records
    const dirtyRecords = data.filter(m => m.metric_type !== 'consolidated');
    
    if (dirtyRecords.length === 0) {
        console.log('\n✅ Database is CLEAN! No dirty records found.');
        return;
    }
    
    console.log(`\n🗑️ FOUND ${dirtyRecords.length} DIRTY RECORDS:`);
    dirtyRecords.forEach(r => {
        console.log(`   ${r.metric_type} (${r.period}) - ${r.tenant_id.substring(0, 8)}`);
    });
    
    // Clean dirty records
    console.log('\n🧹 CLEANING dirty records...');
    
    const dirtyIds = dirtyRecords.map(r => r.id);
    const { error: deleteError } = await supabase
        .from('tenant_metrics')
        .delete()
        .in('id', dirtyIds);
    
    if (deleteError) {
        console.log('❌ Error cleaning:', deleteError.message);
        return;
    }
    
    console.log(`✅ CLEANED ${dirtyRecords.length} dirty records`);
    
    // Verify final state
    const { data: finalData } = await supabase
        .from('tenant_metrics')
        .select('metric_type')
        .eq('metric_type', 'consolidated');
    
    console.log(`\n🎯 FINAL STATE: ${finalData?.length || 0} consolidated records`);
    console.log('✅ Database is now CLEAN!');
}

checkAndCleanDirtyRecords();