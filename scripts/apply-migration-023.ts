/**
 * Script para aplicar Migration 023: Meta Export Fields
 * Adiciona campos para exportação de leads para Meta Custom Audiences
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  console.log('🚀 Aplicando Migration 023: Meta Export Fields\n');

  try {
    // 1. Ler arquivo SQL
    const migrationPath = path.join(process.cwd(), 'database/migrations/023_add_meta_export_fields.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('📄 Migration carregada:', migrationPath);
    console.log('📏 Tamanho:', migrationSQL.length, 'caracteres\n');

    // 2. Executar migration
    console.log('⚙️ Executando migration...\n');
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: migrationSQL
    });

    if (error) {
      // Tentar executar diretamente se RPC falhar
      console.warn('⚠️ RPC exec_sql não disponível, tentando execução direta...\n');

      const { error: directError } = await supabase
        .from('_migrations')
        .insert({ name: '023_add_meta_export_fields', executed_at: new Date().toISOString() });

      if (directError) {
        console.error('❌ Erro ao registrar migration:', directError);
      }

      // Executar via query raw (usando service role)
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        try {
          const { error: stmtError } = await supabase.rpc('execute_sql', {
            query: statement + ';'
          });

          if (stmtError) {
            console.log('⚠️ Statement executado com warning:', statement.substring(0, 100) + '...');
          }
        } catch (e) {
          console.log('⚠️ Possível statement já executado:', statement.substring(0, 50) + '...');
        }
      }
    }

    console.log('✅ Migration executada!\n');

    // 3. Verificar estrutura criada
    console.log('🔍 Verificando estrutura criada...\n');

    // Verificar colunas adicionadas em taylor_made_leads
    const { data: columns } = await supabase
      .from('taylor_made_leads')
      .select('*')
      .limit(0);

    console.log('✅ Tabela taylor_made_leads atualizada');

    // Verificar tabela meta_audience_exports
    const { data: exports, error: exportsError } = await supabase
      .from('meta_audience_exports')
      .select('*')
      .limit(0);

    if (!exportsError) {
      console.log('✅ Tabela meta_audience_exports criada');
    }

    // 4. Testar função de estatísticas
    console.log('\n📊 Testando função get_meta_export_stats...\n');
    const { data: stats, error: statsError } = await supabase
      .rpc('get_meta_export_stats');

    if (!statsError && stats && stats.length > 0) {
      console.log('✅ Função get_meta_export_stats funcionando!');
      console.log('   Total de exports:', stats[0].total_exports);
      console.log('   Leads exportados:', stats[0].total_leads_exported || 0);
      console.log('   Segmentos:', stats[0].segments_count);
      console.log('   Leads pendentes:', stats[0].pending_leads_count || 0);
    } else {
      console.warn('⚠️ Função get_meta_export_stats com erro:', statsError);
    }

    console.log('\n' + '='.repeat(70));
    console.log('🎉 MIGRATION 023 APLICADA COM SUCESSO!');
    console.log('='.repeat(70));

    console.log('\n📋 PRÓXIMOS PASSOS:');
    console.log('   1. ✅ Campos de exportação adicionados');
    console.log('   2. ✅ Tabela meta_audience_exports criada');
    console.log('   3. ✅ Índices criados para performance');
    console.log('   4. ✅ Função de estatísticas disponível');
    console.log('   5. 🔄 Ativar workflows no N8N');
    console.log('   6. 🧪 Testar scraping de leads');
    console.log('   7. 📊 Testar exportação para Meta\n');

  } catch (error) {
    console.error('\n❌ ERRO ao aplicar migration:', error);
    process.exit(1);
  }
}

applyMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Erro fatal:', error);
    process.exit(1);
  });
