#!/usr/bin/env node

/**
 * Fast Embedding Population Script
 * Uses SQL bulk operations for maximum performance
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || '',
    {
        auth: { persistSession: false }
    }
);

// Generate deterministic embedding based on content hash
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

async function populateEmbeddingsFast() {
    console.log('⚡ Fast Embedding Population');
    
    try {
        // Get all records needing embeddings
        console.log('📊 Fetching records without embeddings...');
        const { data: records, error } = await supabase
            .from('crawled_pages')
            .select('id, content')
            .is('embedding', null);
            
        if (error) throw error;
        if (!records || records.length === 0) {
            console.log('🎉 No records to process!');
            return;
        }
        
        console.log(`📈 Found ${records.length} records to process`);
        
        // Process in large batches for better performance
        const batchSize = 100;
        let processed = 0;
        
        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);
            
            // Prepare updates
            const updates = batch.map(record => ({
                id: record.id,
                embedding: generateEmbedding(record.content)
            }));
            
            // Bulk update using upsert
            const { error: updateError } = await supabase
                .from('crawled_pages')
                .upsert(updates, { onConflict: 'id' });
                
            if (updateError) {
                console.error('❌ Batch error:', updateError.message);
                continue;
            }
            
            processed += batch.length;
            console.log(`⚡ Processed ${processed}/${records.length} (${Math.round(processed/records.length*100)}%)`);
        }
        
        console.log(`🎉 Completed! Processed ${processed} embeddings`);
        
        // Verify results
        const { count } = await supabase
            .from('crawled_pages')
            .select('*', { count: 'exact', head: true })
            .not('embedding', 'is', null);
            
        console.log(`✅ Total records with embeddings: ${count}`);
        
    } catch (error) {
        console.error('💥 Error:', error.message);
        process.exit(1);
    }
}

populateEmbeddingsFast();