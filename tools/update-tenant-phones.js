#!/usr/bin/env node

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

// Mapeamento tenant ID -> telefone do negócio
const TENANT_PHONE_MAP = {
  'f34d8c94-f6cf-4dd7-82de-a3123b380cd8': '5511999001001', // Healthcare 1
  'fe2fa876-05da-49b5-b266-8141bcd090fa': '5511999001002', // Healthcare 2
  '33b8c488-5aa9-4891-b335-701d10296681': '5511999002001', // Beauty 1
  '5bd592ee-8247-4a62-862e-7491fa499103': '5511999002002', // Beauty 2
  '85cee693-a2e2-444a-926a-19f69db13489': '5511999003001', // Education 1
  'c3aa73f8-db80-40db-a9c4-73718a0fee34': '5511999003002', // Education 2
  '7ae2807f-4a30-4b37-b11e-073b79a3b0c4': '5511999004001', // Sports 1
  '4853f74d-9518-4476-bfa7-9cb4e43af04a': '5511999004002', // Sports 2
  'ae509773-6b9d-45f9-925c-dfa3edd0326a': '5511999005001', // Legal 1
  '765b26dc-f8e3-4eb2-b1c6-a896d99d1c2a': '5511999005002', // Legal 2
  '151b2fb0-39e6-4a7f-bf87-3454a5327cb4': '5511999006001', // Consulting 1
  '4a6dc7c4-abd6-4ca6-bb4c-f4d14a3579f5': '5511999006002', // Consulting 2
};

async function updateTenantPhones() {
  console.log('🔄 Atualizando telefones dos tenants...');
  
  for (const [tenantId, phone] of Object.entries(TENANT_PHONE_MAP)) {
    console.log(`📱 Atualizando tenant ${tenantId} com telefone ${phone}`);
    
    const { error } = await supabase
      .from('tenants')
      .update({ phone: phone })
      .eq('id', tenantId);
    
    if (error) {
      console.error(`❌ Erro ao atualizar ${tenantId}:`, error);
    } else {
      console.log(`✅ ${tenantId} atualizado com sucesso`);
    }
  }
  
  console.log('✅ Atualização concluída!');
}

updateTenantPhones().catch(console.error);