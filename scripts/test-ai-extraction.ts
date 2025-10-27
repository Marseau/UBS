import { config } from 'dotenv';
import OpenAI from 'openai';

config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

async function extractNameWithAI(username: string): Promise<string | null> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Você é um especialista em extrair nomes de pessoas de usernames do Instagram.

REGRAS:
1. Identifique o NOME DA PESSOA no username
2. Remova prefixos profissionais (nutricionista, dr, dra, personal, fisio, etc.)
3. Separe nomes compostos corretamente
4. Retorne APENAS o nome da pessoa, capitalizado
5. Se não conseguir identificar um nome, retorne "NONE"

EXEMPLOS:
- "nutricionistajulianacorrea" → "Juliana Correa"
- "dra.silvialeitefaria" → "Silvia Leite Faria"
- "personaltrainer.bianca" → "Bianca"
- "clinica_boaforma" → "NONE" (não é pessoa)
- "dr.kevensousa" → "Keven Sousa"`
        },
        {
          role: 'user',
          content: username
        }
      ],
      temperature: 0.3,
      max_tokens: 50
    });

    const result = response.choices[0]?.message?.content?.trim();

    if (!result || result === 'NONE' || result.length < 3) {
      return null;
    }

    return result;

  } catch (error: any) {
    console.log(`Erro: ${error.message}`);
    return null;
  }
}

// Testes
const testCases = [
  'nutricionistajulianacorrea',
  'dra.silvialeitefaria',
  'personaltrainer.bianca',
  'nutricionista.alinecarvalho',
  'dr.kevensousa',
  'treinador_beltrao',
  'clinica_boaforma',
  'andressanaiane_nutricionista',
  'nutricionistapatricialeite'
];

(async () => {
  console.log('🤖 Testando extração de nomes com GPT-4o Mini:\n');

  for (const username of testCases) {
    const extracted = await extractNameWithAI(username);
    console.log(`@${username}`);
    console.log(`   → ${extracted || '(não identificado)'}\n`);
  }
})();
