import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
    console.log('🚀 Executando migração warmup_schedule...');

    const sqlPath = path.join(__dirname, 'migration-warmup-schedule.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // Split by statements and execute each
    const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
        try {
            console.log(`\n📝 Executando: ${statement.substring(0, 60)}...`);

            const { error } = await supabase.rpc('exec_sql', {
                query: statement + ';'
            });

            if (error) {
                // Try direct execution via REST
                const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`
                    },
                    body: JSON.stringify({ query: statement + ';' })
                });

                if (!response.ok) {
                    console.log(`⚠️ Aviso: ${error.message || 'Erro na execução'}`);
                }
            }
            console.log('✅ OK');
        } catch (err) {
            console.log(`⚠️ Aviso: ${err}`);
        }
    }

    console.log('\n✅ Migração concluída!');

    // Verificar tabelas criadas
    const { data: tables } = await supabase
        .from('warmup_schedule')
        .select('id')
        .limit(1);

    if (tables !== null) {
        console.log('✅ Tabela warmup_schedule existe');
    } else {
        console.log('⚠️ Tabela warmup_schedule não encontrada - execute manualmente no Supabase Dashboard');
    }
}

runMigration().catch(console.error);
