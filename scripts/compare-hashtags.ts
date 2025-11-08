import * as fs from 'fs';
import * as path from 'path';

interface HashtagData {
  hashtag: string;
  frequency: number;
  percentage: number;
  rank?: number;
}

function parseCSV(filePath: string): Map<string, HashtagData> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n').slice(1); // Skip header

  const map = new Map<string, HashtagData>();

  lines.forEach((line, index) => {
    const [hashtag, frequency, percentage] = line.split(',');
    map.set(hashtag.trim(), {
      hashtag: hashtag.trim(),
      frequency: parseInt(frequency.trim()),
      percentage: parseFloat(percentage.trim()),
      rank: index + 1
    });
  });

  return map;
}

function compareHashtags() {
  console.log('📊 COMPARAÇÃO: Todas as Hashtags vs Leads Qualificados (com contato)\n');
  console.log('='  .repeat(80));

  const allHashtags = parseCSV(path.join(process.cwd(), 'top_100_hashtags.csv'));
  const qualifiedHashtags = parseCSV(path.join(process.cwd(), 'top_100_hashtags_qualified.csv'));

  console.log(`\n📈 ESTATÍSTICAS GERAIS:`);
  console.log(`   Total de leads: 2.918`);
  console.log(`   Leads qualificados (com contato): 1.489 (50.9%)`);
  console.log(`   Hashtags únicas (todos): ${allHashtags.size}`);
  console.log(`   Hashtags únicas (qualificados): ${qualifiedHashtags.size}\n`);

  // Top 10 comparação lado a lado
  console.log('='  .repeat(80));
  console.log('🏆 TOP 10 COMPARAÇÃO\n');
  console.log('RANK | TODAS AS LEADS              | LEADS QUALIFICADOS (COM CONTATO)');
  console.log('-'.repeat(80));

  const allTop10 = Array.from(allHashtags.values()).slice(0, 10);
  const qualTop10 = Array.from(qualifiedHashtags.values()).slice(0, 10);

  for (let i = 0; i < 10; i++) {
    const all = allTop10[i];
    const qual = qualTop10[i];

    const allStr = `${all.hashtag} (${all.frequency})`.padEnd(28);
    const qualStr = `${qual.hashtag} (${qual.frequency})`;

    console.log(`${String(i + 1).padStart(4)} | ${allStr} | ${qualStr}`);
  }

  // Mudanças de ranking significativas
  console.log('\n' + '='.repeat(80));
  console.log('📈 MAIORES GANHOS DE POSIÇÃO (Leads Qualificados)\n');

  const improvements: Array<{hashtag: string, allRank: number, qualRank: number, gain: number}> = [];

  qualifiedHashtags.forEach((qualData, hashtag) => {
    const allData = allHashtags.get(hashtag);
    if (allData) {
      const gain = allData.rank! - qualData.rank!;
      if (gain > 0) {
        improvements.push({
          hashtag,
          allRank: allData.rank!,
          qualRank: qualData.rank!,
          gain
        });
      }
    }
  });

  improvements.sort((a, b) => b.gain - a.gain);

  improvements.slice(0, 15).forEach(item => {
    console.log(`   📊 ${item.hashtag.padEnd(30)} | Posição ${String(item.allRank).padStart(3)} → ${String(item.qualRank).padStart(3)} (↑${item.gain})`);
  });

  // Hashtags exclusivas de leads qualificados
  console.log('\n' + '='.repeat(80));
  console.log('🆕 HASHTAGS EXCLUSIVAS DE LEADS QUALIFICADOS (Top 100)\n');

  const exclusiveQualified: string[] = [];
  qualifiedHashtags.forEach((data, hashtag) => {
    if (!allHashtags.has(hashtag)) {
      exclusiveQualified.push(hashtag);
    }
  });

  if (exclusiveQualified.length > 0) {
    exclusiveQualified.forEach(hashtag => {
      const data = qualifiedHashtags.get(hashtag)!;
      console.log(`   ✨ ${hashtag.padEnd(30)} | ${data.frequency} menções (${data.percentage}%)`);
    });
  } else {
    console.log('   Nenhuma hashtag exclusiva encontrada no Top 100.');
  }

  // Análise de categorias
  console.log('\n' + '='.repeat(80));
  console.log('🎯 ANÁLISE POR CATEGORIA\n');

  const categories = {
    'Negócios/Empreendedorismo': ['empreendedorismo', 'negocios', 'negócios', 'empresas', 'vendas', 'vendasonline', 'sucesso'],
    'Marketing/Digital': ['marketingdigital', 'marketing', 'trafegopago', 'socialmedia', 'branding', 'estrategiadigital'],
    'Tecnologia/Inovação': ['tecnologia', 'inovação', 'inovacao', 'inteligenciaartificial', 'ia', 'transformacaodigital', 'automacao', 'erp'],
    'Desenvolvimento Pessoal': ['autoconhecimento', 'autocuidado', 'desenvolvimentopessoal', 'autoestima', 'crescimentopessoal'],
    'Saúde/Bem-estar': ['bemestar', 'saude', 'saúde', 'saudemental', 'saúdemental', 'terapia', 'psicologia'],
    'Profissões': ['contabilidade', 'advocacia', 'direito', 'odontologia', 'contador', 'fisioterapia'],
    'Espiritualidade': ['espiritualidade', 'fé', 'tarot', 'energia', 'umbanda', 'gratidão']
  };

  Object.entries(categories).forEach(([category, keywords]) => {
    let allTotal = 0;
    let qualTotal = 0;

    keywords.forEach(keyword => {
      const allData = allHashtags.get(keyword);
      const qualData = qualifiedHashtags.get(keyword);

      if (allData) allTotal += allData.frequency;
      if (qualData) qualTotal += qualData.frequency;
    });

    const allPercent = ((allTotal / 2918) * 100).toFixed(2);
    const qualPercent = ((qualTotal / 1489) * 100).toFixed(2);

    console.log(`   ${category.padEnd(30)} | Todas: ${String(allTotal).padStart(4)} (${allPercent}%)  | Qualificadas: ${String(qualTotal).padStart(4)} (${qualPercent}%)`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('✅ Análise concluída!\n');
}

compareHashtags();
