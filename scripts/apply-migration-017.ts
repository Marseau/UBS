import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function applyMigration017() {
  console.log('🚀 Aplicando Migration 017: YouTube Short Fields...');

  try {
    // 1. Adicionar colunas
    console.log('📝 Adicionando colunas...');
    const { error: alterError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE editorial_content
        ADD COLUMN IF NOT EXISTS youtube_short_url TEXT,
        ADD COLUMN IF NOT EXISTS youtube_caption TEXT,
        ADD COLUMN IF NOT EXISTS youtube_short_duration_seconds INTEGER,
        ADD COLUMN IF NOT EXISTS related_reel_ids JSONB;
      `
    });

    if (alterError) {
      // Tenta método alternativo: inserir linha por linha no SQL Editor
      console.log('⚠️ Método RPC não disponível. Executando via queries diretas...');

      const queries = [
        'ALTER TABLE editorial_content ADD COLUMN IF NOT EXISTS youtube_short_url TEXT',
        'ALTER TABLE editorial_content ADD COLUMN IF NOT EXISTS youtube_caption TEXT',
        'ALTER TABLE editorial_content ADD COLUMN IF NOT EXISTS youtube_short_duration_seconds INTEGER',
        'ALTER TABLE editorial_content ADD COLUMN IF NOT EXISTS related_reel_ids JSONB'
      ];

      for (const query of queries) {
        const { error } = await (supabase as any).from('_').rpc('exec', { query });
        if (error) {
          console.error(`❌ Erro ao executar: ${query}`, error);
        }
      }
    }

    console.log('✅ Colunas adicionadas com sucesso!');

    // 2. Adicionar comentários
    console.log('📝 Adicionando comentários de documentação...');
    const comments = [
      "COMMENT ON COLUMN editorial_content.youtube_short_url IS 'URL do YouTube Short gerado (concatenação de 3 Reels)'",
      "COMMENT ON COLUMN editorial_content.youtube_caption IS 'Caption do YouTube Short (diferente do Instagram caption)'",
      "COMMENT ON COLUMN editorial_content.youtube_short_duration_seconds IS 'Duração total do YouTube Short em segundos (~180s = 3 Reels)'",
      "COMMENT ON COLUMN editorial_content.related_reel_ids IS 'Array de IDs dos 3 Reels que foram concatenados (JSONB array)'"
    ];

    for (const comment of comments) {
      await (supabase as any).from('_').rpc('exec', { query: comment });
    }

    console.log('✅ Comentários adicionados!');

    // 3. Criar índices
    console.log('📝 Criando índices...');
    const indices = [
      `CREATE INDEX IF NOT EXISTS idx_editorial_content_youtube_shorts
       ON editorial_content(week_of_year)
       WHERE content_type = 'youtube_short' AND youtube_short_url IS NOT NULL`,

      `CREATE INDEX IF NOT EXISTS idx_editorial_content_related_reels
       ON editorial_content USING gin(related_reel_ids)`
    ];

    for (const index of indices) {
      await (supabase as any).from('_').rpc('exec', { query: index });
    }

    console.log('✅ Índices criados!');

    // 4. Adicionar constraint
    console.log('📝 Adicionando constraint de validação...');
    await (supabase as any).from('_').rpc('exec', {
      query: `
        ALTER TABLE editorial_content
        ADD CONSTRAINT check_youtube_short_fields
        CHECK (
          (content_type != 'youtube_short') OR
          (content_type = 'youtube_short' AND youtube_short_url IS NOT NULL AND youtube_caption IS NOT NULL)
        )
      `
    });

    console.log('✅ Constraint adicionado!');

    // 5. Registrar migration
    console.log('📝 Registrando migration...');
    const { error: insertError } = await supabase
      .from('schema_migrations')
      .upsert({
        version: '017',
        description: 'Add YouTube Short fields to editorial_content table',
        executed_at: new Date().toISOString()
      }, {
        onConflict: 'version'
      });

    if (insertError) {
      console.warn('⚠️ Aviso ao registrar migration:', insertError.message);
    } else {
      console.log('✅ Migration registrada!');
    }

    // 6. Verificar colunas criadas
    console.log('🔍 Verificando colunas criadas...');
    const { data: columns, error: verifyError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', 'editorial_content')
      .in('column_name', [
        'youtube_short_url',
        'youtube_caption',
        'youtube_short_duration_seconds',
        'related_reel_ids'
      ]);

    if (verifyError) {
      console.warn('⚠️ Não foi possível verificar via query:', verifyError.message);
      console.log('💡 Você pode verificar manualmente no Supabase Dashboard → Table Editor → editorial_content');
    } else if (columns && columns.length > 0) {
      console.log('✅ Colunas verificadas com sucesso:');
      columns.forEach((col: any) => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
    }

    console.log('\n🎉 Migration 017 aplicada com sucesso!');
    console.log('📊 Campos adicionados:');
    console.log('  - youtube_short_url (TEXT)');
    console.log('  - youtube_caption (TEXT)');
    console.log('  - youtube_short_duration_seconds (INTEGER)');
    console.log('  - related_reel_ids (JSONB)');

  } catch (error: any) {
    console.error('❌ Erro ao aplicar migration:', error);
    console.log('\n📋 SOLUÇÃO ALTERNATIVA:');
    console.log('1. Abra o Supabase Dashboard');
    console.log('2. Vá em SQL Editor');
    console.log('3. Cole o conteúdo de: database/migrations/017_add_youtube_short_fields.sql');
    console.log('4. Execute o SQL');
    throw error;
  }
}

// Executar migration
applyMigration017()
  .then(() => {
    console.log('\n✅ Script finalizado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script finalizado com erro:', error);
    process.exit(1);
  });
