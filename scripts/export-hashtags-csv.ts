import * as dotenv from 'dotenv';
dotenv.config();

import { hashtagCsvExportService } from '../src/services/hashtag-csv-export.service';

async function run() {
  console.log('Exportando hashtags para CSV...\n');
  const result = await hashtagCsvExportService.exportAllHashtags();
  console.log('\nResultado:', result);
}

run().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
