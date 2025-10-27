const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Configurar SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const SQL = `
CREATE TABLE IF NOT EXISTS taylor_made_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  user_type TEXT NOT NULL,
  business_segment TEXT NOT NULL,
  main_challenge TEXT NOT NULL,
  lead_volume TEXT NOT NULL,
  modules_interest TEXT[] NOT NULL,
  source TEXT,
  status TEXT DEFAULT 'new',
  notes TEXT,
  contacted_at TIMESTAMPTZ,
  proposal_sent_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  timestamp TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE taylor_made_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit Taylor Made leads" ON taylor_made_leads;
CREATE POLICY "Anyone can submit Taylor Made leads"
  ON taylor_made_leads
  FOR INSERT
  WITH CHECK (true);
`;

async function run() {
  console.log('🚀 Aplicando migration...');

  try {
    // Test insert to create table
    const testData = {
      name: 'Test Migration',
      email: 'test@test.com',
      whatsapp: '11999999999',
      user_type: 'local_business',
      business_segment: 'beauty',
      main_challenge: 'lost_leads',
      lead_volume: '50_200',
      modules_interest: ['scheduling'],
      timestamp: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('taylor_made_leads')
      .insert([testData])
      .select();

    if (error) {
      console.log('⚠️ Tabela não existe, criando via SQL Editor é necessário');
      console.log('📋 Copie este SQL e execute no Supabase Dashboard:');
      console.log('');
      console.log(SQL);
      console.log('');
      console.log('🔗 https://supabase.com/dashboard → SQL Editor');
    } else {
      console.log('✅ Tabela já existe! Lead de teste criado:', data[0].id);

      // Delete test lead
      await supabase
        .from('taylor_made_leads')
        .delete()
        .eq('email', 'test@test.com');

      console.log('🧹 Lead de teste removido');
    }
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

run();
