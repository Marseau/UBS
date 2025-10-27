import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

async function testKeywordExtraction() {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!
  });

  const carlaScript = 'Eu perdia 15 leads por semana.';
  const brunoScript = 'Com UBS, leads são respondidos em 3 segundos. Resultado: +67% de conversão.';
  const fullScript = `Carla: ${carlaScript}\n\nBruno: ${brunoScript}`;
  const targetDuration = 8; // segundos
  const numKeywords = Math.ceil(targetDuration / 5);

  console.log('📝 Script completo:');
  console.log(fullScript);
  console.log(`\n🎯 Duração alvo: ${targetDuration}s`);
  console.log(`🔢 Keywords necessárias: ${numKeywords}\n`);

  const prompt = `Você é um diretor de vídeo especializado em selecionar B-roll footage.

Analise este script de vídeo e extraia ${numKeywords} keywords visuais para buscar stock footage (5 segundos por clip).

REGRAS:
- Keywords devem ser GENÉRICAS e VISUAIS (não conceitos abstratos)
- Preferir: "business meeting", "laptop work", "office team", "smartphone typing"
- Evitar: "agendamento", "conversão", "leads" (conceitos abstratos)
- Keywords em INGLÊS (Pexels API)
- 1 keyword por segmento de ~5 segundos

SCRIPT:
${fullScript}

Retorne JSON no formato:
{
  "keywords": ["keyword1", "keyword2"],
  "reasoning": "Explicação da escolha de cada keyword"
}`;

  console.log('🤖 Chamando GPT-4 para extração de keywords...\n');

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 500
  });

  const content = response.choices[0]?.message?.content || '{}';
  console.log('📊 Resposta do GPT-4:');
  console.log(content);

  try {
    const parsed = JSON.parse(content);
    console.log('\n✅ Keywords extraídas:');
    parsed.keywords?.forEach((kw: string, i: number) => {
      console.log(`  ${i + 1}. "${kw}"`);
    });

    if (parsed.reasoning) {
      console.log(`\n💡 Raciocínio: ${parsed.reasoning}`);
    }
  } catch (e) {
    console.error('❌ Erro ao parsear JSON:', e);
  }
}

testKeywordExtraction();
