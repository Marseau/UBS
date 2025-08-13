#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function resetAnalytics() {
    console.log('🔥 Resetting Analytics Optimization Infrastructure...');
    try {
        const resetScriptPath = path.join(__dirname, '..', 'database', 'reset-analytics-schema.sql');
        if (!fs.existsSync(resetScriptPath)) {
            console.error('❌ Reset script not found:', resetScriptPath);
            process.exit(1);
        }
        const resetSQL = fs.readFileSync(resetScriptPath, 'utf8');

        console.log('⚡ Executing reset script...');
        const { error } = await supabase.rpc('exec_sql', { sql_statement: resetSQL });

        if (error) {
            console.error('❌ An error occurred during reset:', error);
            process.exit(1);
        }

        console.log('✅ Analytics infrastructure has been successfully reset.');

    } catch (error) {
        console.error('❌ Failed to reset analytics infrastructure:', error);
        process.exit(1);
    }
}

resetAnalytics().catch(console.error); 