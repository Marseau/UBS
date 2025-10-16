import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  console.log('🚀 Applying publication_date migration to editorial_content table...\n');

  try {
    console.log('📋 Checking if publication_date column exists...');

    const { data: columns, error: columnsError } = await supabase
      .from('editorial_content')
      .select('*')
      .limit(1);

    if (columnsError) {
      console.error('❌ Error checking table:', columnsError);
      throw columnsError;
    }

    const hasPublicationDate = columns && columns[0] && 'publication_date' in columns[0];

    if (hasPublicationDate) {
      console.log('✅ publication_date column already exists!');
    } else {
      console.log('⚠️  publication_date column does not exist yet.');
      console.log('\n📝 Please run this SQL in Supabase SQL Editor:\n');
      console.log('--- Copy this SQL to Supabase SQL Editor ---\n');
      console.log(`
ALTER TABLE editorial_content
ADD COLUMN publication_date DATE;

COMMENT ON COLUMN editorial_content.publication_date IS 'Data de publicação da semana editorial (segunda-feira da semana)';

CREATE OR REPLACE FUNCTION get_monday_of_week(week_num INTEGER, year_num INTEGER)
RETURNS DATE AS $$
DECLARE
  jan1 DATE;
  day_of_week INTEGER;
  days_to_monday INTEGER;
  first_monday DATE;
  target_date DATE;
BEGIN
  jan1 := make_date(year_num, 1, 1);
  day_of_week := EXTRACT(DOW FROM jan1);
  IF day_of_week <= 1 THEN
    days_to_monday := 1 - day_of_week;
  ELSE
    days_to_monday := 8 - day_of_week;
  END IF;
  first_monday := jan1 + days_to_monday;
  target_date := first_monday + ((week_num - 1) * 7);
  RETURN target_date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

UPDATE editorial_content
SET publication_date = get_monday_of_week(week_number, year)
WHERE publication_date IS NULL;

CREATE INDEX idx_editorial_publication_date
  ON editorial_content(publication_date DESC);
      `);
      console.log('\n--- End of SQL ---\n');
      console.log('After running the SQL, re-run this script to verify.');
      return;
    }

    console.log('\n📊 Verifying publication_date values...');

    const { data, error } = await supabase
      .from('editorial_content')
      .select('week_number, year, publication_date')
      .order('year', { ascending: false })
      .order('week_number', { ascending: false })
      .limit(5);

    if (error) {
      console.error('❌ Error fetching data:', error);
      throw error;
    }

    if (data && data.length > 0) {
      console.log('\n✅ Latest 5 editorial records with publication_date:');
      console.table(data);
    } else {
      console.log('⚠️  No records found in editorial_content table');
    }

    console.log('\n✅ Migration verification complete!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

applyMigration();
