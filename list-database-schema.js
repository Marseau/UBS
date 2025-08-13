const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function listDatabaseSchema() {
  console.log('🗄️  UNIVERSAL BOOKING SYSTEM - DATABASE SCHEMA ANALYSIS');
  console.log('=' .repeat(70));
  
  try {
    // Get all tables in the public schema
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name, table_type')
      .eq('table_schema', 'public')
      .order('table_name');
      
    if (tablesError) {
      console.error('❌ Error fetching tables:', tablesError);
      return;
    }
    
    console.log(`\n📋 FOUND ${tables.length} TABLES IN PUBLIC SCHEMA:\n`);
    
    // Group tables by category
    const categorizedTables = {
      'Core Business': [],
      'User Management': [],
      'Analytics & Metrics': [],
      'Payment & Billing': [],
      'System & Admin': [],
      'AI & Automation': [],
      'External Integrations': [],
      'Other': []
    };
    
    // Categorize tables
    tables.forEach(table => {
      const name = table.table_name;
      
      if (name.includes('tenant') || name.includes('appointment') || name.includes('service') || name.includes('professional')) {
        categorizedTables['Core Business'].push(table);
      } else if (name.includes('user') || name.includes('customer') || name.includes('auth')) {
        categorizedTables['User Management'].push(table);
      } else if (name.includes('metric') || name.includes('analytic') || name.includes('platform') || name.includes('ubs')) {
        categorizedTables['Analytics & Metrics'].push(table);
      } else if (name.includes('stripe') || name.includes('payment') || name.includes('billing') || name.includes('subscription')) {
        categorizedTables['Payment & Billing'].push(table);
      } else if (name.includes('admin') || name.includes('system') || name.includes('config') || name.includes('setting')) {
        categorizedTables['System & Admin'].push(table);
      } else if (name.includes('conversation') || name.includes('intent') || name.includes('ai_') || name.includes('rule')) {
        categorizedTables['AI & Automation'].push(table);
      } else if (name.includes('whatsapp') || name.includes('calendar') || name.includes('email') || name.includes('google')) {
        categorizedTables['External Integrations'].push(table);
      } else {
        categorizedTables['Other'].push(table);
      }
    });
    
    // Display categorized tables
    for (const [category, tableList] of Object.entries(categorizedTables)) {
      if (tableList.length > 0) {
        console.log(`\n🏷️  ${category.toUpperCase()} (${tableList.length} tables):`);
        console.log('-'.repeat(50));
        
        for (const table of tableList) {
          // Get column information for each table
          const { data: columns, error: columnsError } = await supabase
            .from('information_schema.columns')
            .select('column_name, data_type, is_nullable, column_default')
            .eq('table_schema', 'public')
            .eq('table_name', table.table_name)
            .order('ordinal_position');
            
          if (!columnsError && columns) {
            console.log(`\n📋 ${table.table_name} (${table.table_type})`);
            console.log(`   📊 ${columns.length} columns:`);
            
            // Show first few columns as preview
            const preview = columns.slice(0, 8);
            preview.forEach(col => {
              const nullable = col.is_nullable === 'YES' ? '?' : '';
              const defaultVal = col.column_default ? ` = ${col.column_default}` : '';
              console.log(`   • ${col.column_name}${nullable}: ${col.data_type}${defaultVal}`);
            });
            
            if (columns.length > 8) {
              console.log(`   ... and ${columns.length - 8} more columns`);
            }
            
            // Get row count
            try {
              const { count, error: countError } = await supabase
                .from(table.table_name)
                .select('*', { count: 'exact', head: true });
                
              if (!countError) {
                console.log(`   📊 Records: ${count || 0}`);
              }
            } catch (e) {
              console.log(`   📊 Records: Unable to count`);
            }
          } else {
            console.log(`\n📋 ${table.table_name} (${table.table_type})`);
            console.log(`   ❌ Could not fetch column information`);
          }
        }
      }
    }
    
    // Get database functions
    console.log('\n\n🔧 DATABASE FUNCTIONS:');
    console.log('=' .repeat(50));
    
    const { data: functions, error: functionsError } = await supabase
      .from('information_schema.routines')
      .select('routine_name, routine_type, data_type')
      .eq('routine_schema', 'public')
      .order('routine_name');
      
    if (!functionsError && functions) {
      console.log(`\n📋 FOUND ${functions.length} FUNCTIONS/PROCEDURES:\n`);
      
      const functionsByType = {
        'Metrics & Analytics': [],
        'Business Logic': [],
        'Data Processing': [],
        'Other': []
      };
      
      functions.forEach(func => {
        const name = func.routine_name;
        
        if (name.includes('metric') || name.includes('analytics') || name.includes('calculate') || name.includes('platform')) {
          functionsByType['Metrics & Analytics'].push(func);
        } else if (name.includes('appointment') || name.includes('booking') || name.includes('tenant')) {
          functionsByType['Business Logic'].push(func);
        } else if (name.includes('process') || name.includes('update') || name.includes('sync')) {
          functionsByType['Data Processing'].push(func);
        } else {
          functionsByType['Other'].push(func);
        }
      });
      
      for (const [type, funcList] of Object.entries(functionsByType)) {
        if (funcList.length > 0) {
          console.log(`\n🏷️  ${type.toUpperCase()} (${funcList.length} functions):`);
          console.log('-'.repeat(40));
          
          funcList.forEach(func => {
            console.log(`• ${func.routine_name} (${func.routine_type})`);
          });
        }
      }
    }
    
    // Summary
    console.log('\n\n📊 SCHEMA SUMMARY:');
    console.log('=' .repeat(50));
    console.log(`📋 Total Tables: ${tables.length}`);
    console.log(`🔧 Total Functions: ${functions ? functions.length : 0}`);
    console.log(`🗄️  Database: ${process.env.SUPABASE_URL}`);
    console.log(`⏰ Analysis Date: ${new Date().toISOString()}`);
    
    // Save to file
    const report = {
      timestamp: new Date().toISOString(),
      database_url: process.env.SUPABASE_URL,
      tables: tables,
      functions: functions || [],
      categorized_tables: categorizedTables,
      summary: {
        total_tables: tables.length,
        total_functions: functions ? functions.length : 0
      }
    };
    
    fs.writeFileSync('database-schema-report.json', JSON.stringify(report, null, 2));
    console.log('\n💾 Detailed report saved to: database-schema-report.json');
    
  } catch (error) {
    console.error('❌ Error analyzing database schema:', error);
  }
}

// Run the analysis
listDatabaseSchema().catch(console.error);