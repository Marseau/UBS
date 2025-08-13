#!/usr/bin/env node

/**
 * Update Embeddings Only Script
 * Updates only the embedding field to avoid constraint issues
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
);

// Generate deterministic embedding
function generateEmbedding(content, dimension = 1536) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    
    const embedding = [];
    let seed = Math.abs(hash);
    
    for (let i = 0; i < dimension; i++) {
        seed = (seed * 9301 + 49297) % 233280;
        const random = seed / 233280.0;
        embedding.push((random - 0.5) * 2);
    }
    
    return embedding;
}

async function updateEmbeddings() {
    console.log('⚡ Updating Embeddings Only');
    
    try {
        console.log('📊 Getting records without embeddings...');
        const { data: records, error } = await supabase
            .from('crawled_pages')
            .select('id, content')
            .is('embedding', null)
            .limit(100); // Process in smaller batches
            
        if (error) throw error;
        if (!records || records.length === 0) {
            console.log('🎉 No records to process!');
            return;
        }
        
        console.log(`📈 Processing ${records.length} records...`);
        
        let processed = 0;
        let errors = 0;
        
        // Process one by one to avoid constraint issues
        for (const record of records) {
            try {
                const embedding = generateEmbedding(record.content);
                
                const { error: updateError } = await supabase
                    .from('crawled_pages')
                    .update({ embedding })
                    .eq('id', record.id);
                    
                if (updateError) throw updateError;
                
                processed++;
                if (processed % 10 === 0) {
                    console.log(`⚡ Progress: ${processed}/${records.length}`);
                }
                
            } catch (error) {
                console.error(`❌ Error updating ${record.id}:`, error.message);
                errors++;
            }
        }
        
        console.log(`🎉 Batch completed!`);
        console.log(`✅ Processed: ${processed}`);
        console.log(`❌ Errors: ${errors}`);
        
        // Check remaining
        const { count } = await supabase
            .from('crawled_pages')
            .select('*', { count: 'exact', head: true })
            .is('embedding', null);
            
        console.log(`🔄 Remaining: ${count}`);
        
        if (count > 0) {
            console.log('💡 Run script again to process more records');
        }
        
    } catch (error) {
        console.error('💥 Error:', error.message);
        process.exit(1);
    }
}

updateEmbeddings();