import * as fs from 'fs';
import * as path from 'path';

// Ler Top 100 NORMALIZADO (sem filtro, sem acentos)
const csv100 = fs.readFileSync(path.join(process.cwd(), 'top_100_normalized.csv'), 'utf-8');
const lines100 = csv100.trim().split('\n').slice(1); // Skip header

const top100 = lines100.map(line => {
  const [hashtag, frequency, percentage] = line.split(',');
  return {
    hashtag: hashtag.trim(),
    frequency: parseInt(frequency.trim()),
    percentage: parseFloat(percentage.trim())
  };
});

// Ler Top 50 NORMALIZADO (com filtro 4 campos, sem acentos)
const csv50 = fs.readFileSync(path.join(process.cwd(), 'top_50_filtered_normalized.csv'), 'utf-8');
const lines50 = csv50.trim().split('\n').slice(1); // Skip header

const top50 = lines50.map(line => {
  const [hashtag] = line.split(',');
  return hashtag.trim();
});

// Criar Set do Top 50 para lookup rápido
const top50Set = new Set(top50);

console.log(`📊 Top 100 NORMALIZADO (sem filtro): ${top100.length} hashtags`);
console.log(`📊 Top 50 NORMALIZADO (com filtro 4 campos): ${top50.length} hashtags`);
console.log('');

// Filtrar Top 100: pegar só as que NÃO estão no Top 50
const complementar = top100.filter(item => !top50Set.has(item.hashtag));

console.log(`📊 Complementar (Top 100 - Top 50): ${complementar.length} hashtags`);
console.log('');

// Criar CSV
let csvContent = 'hashtag,frequency,percentage\n';
complementar.forEach(item => {
  csvContent += `${item.hashtag},${item.frequency},${item.percentage}\n`;
});

fs.writeFileSync(path.join(process.cwd(), 'top_complementar_normalized.csv'), csvContent);

console.log('✅ CSV Complementar Normalizado criado!');
console.log('');
console.log('📋 Primeiras 15 hashtags do Conjunto Complementar:');
complementar.slice(0, 15).forEach((item, idx) => {
  console.log(`   ${String(idx + 1).padStart(2)}. ${item.hashtag.padEnd(30)} (${item.frequency} menções, ${item.percentage}%)`);
});
console.log('');
console.log(`📊 Total final: ${top50.length} (Top 50 Filtrado) + ${complementar.length} (Complementar) = ${top50.length + complementar.length} hashtags únicas`);
