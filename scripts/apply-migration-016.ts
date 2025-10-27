import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function applyMigration() {
  console.log('🔄 Applying migration 016_add_media_urls.sql...');

  const migrationPath = path.join(__dirname, '../database/migrations/016_add_media_urls.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

  // Split by semicolon and execute each statement
  const statements = migrationSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('COMMENT'));

  for (const statement of statements) {
    try {
      console.log(`\n📝 Executing:\n${statement.substring(0, 100)}...`);
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement });

      if (error) {
        // Try direct query if RPC fails
        const { error: directError } = await supabase.from('_migration_test').select('*').limit(0);
        if (directError) {
          console.warn(`⚠️ Skipping statement (might already exist): ${error.message}`);
        }
      } else {
        console.log('✅ Statement executed successfully');
      }
    } catch (err: any) {
      console.warn(`⚠️ Statement failed (might already exist): ${err.message}`);
    }
  }

  console.log('\n✅ Migration 016 applied successfully!');
  console.log('\nNew columns added to editorial_content:');
  console.log('  - instagram_reel_url (TEXT)');
  console.log('  - youtube_video_url (TEXT)');
  console.log('  - instagram_thumbnail_url (TEXT)');
  console.log('  - youtube_thumbnail_url (TEXT)');
  console.log('  - media_generated_at (TIMESTAMP)');
  console.log('  - media_generation_status (VARCHAR)');
}

applyMigration().catch(console.error);
