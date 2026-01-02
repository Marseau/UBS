import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  console.log('URL:', process.env.SUPABASE_URL);

  try {
    const { data, error } = await supabase.from('instagram_leads').select('id').limit(1);
    console.log('Test query - error:', error?.message || 'none');
    console.log('Test query - data count:', data?.length);
  } catch (e: any) {
    console.log('Exception:', e.message);
  }
}
main();
