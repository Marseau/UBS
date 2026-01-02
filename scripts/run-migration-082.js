const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runMigration() {
  const sql = fs.readFileSync('./database/migrations/082_whapi_channels_rate_limits.sql', 'utf8');

  // Separar por $$ para funções e ; para comandos normais
  // Primeiro, vamos executar blocos completos
  const blocks = [];
  let currentBlock = '';
  let inFunction = false;

  const lines = sql.split('\n');
  for (const line of lines) {
    // Ignorar comentários de linha inteira
    if (line.trim().startsWith('--')) {
      continue;
    }

    currentBlock += line + '\n';

    // Detectar início de função
    if (line.includes('$$ LANGUAGE') || line.includes('$$;')) {
      blocks.push(currentBlock.trim());
      currentBlock = '';
      inFunction = false;
    } else if (line.includes('AS $$') || line.includes('RETURNS TRIGGER AS $$')) {
      inFunction = true;
    } else if (!inFunction && line.trim().endsWith(';') && !line.includes('DEFAULT')) {
      // Comando simples terminando em ;
      if (currentBlock.trim().length > 5) {
        blocks.push(currentBlock.trim());
      }
      currentBlock = '';
    }
  }

  // Adicionar último bloco se houver
  if (currentBlock.trim().length > 5) {
    blocks.push(currentBlock.trim());
  }

  console.log(`Encontrados ${blocks.length} blocos para executar\n`);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const preview = block.substring(0, 70).replace(/\n/g, ' ');
    console.log(`[${i + 1}/${blocks.length}] ${preview}...`);

    const { error } = await supabase.rpc('execute_sql', { query_text: block });
    if (error) {
      console.error('  ❌ Erro:', error.message);
    } else {
      console.log('  ✅ OK');
    }
  }

  console.log('\n✅ Migration 082 concluída!');
}

runMigration().catch(console.error);
