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
          content: `Você é um especialista em extrair nomes legíveis de usernames do Instagram.

TAREFA:
Extraia o NOME COMPLETO do username (pessoa OU empresa), separando palavras corretamente e removendo apenas prefixos profissionais desnecessários.

REGRAS IMPORTANTES:
1. SEMPRE extraia um nome legível - NUNCA retorne "NONE"
2. Separe nomes compostos MESMO SEM espaços (ex: "analuiza" → "Ana Luiza", "boaforma" → "Boa Forma")
3. Ignore underscores no início/fim (ex: "_alanguimmaraes" → "Alan Guimarães", "matheussonda_" → "Matheus Sonda")
4. Underscores NO MEIO separam palavras (ex: "castro_mandinha" → "Castro Mandinha", "clinica_boaforma" → "Clinica Boa Forma")
5. Remova APENAS prefixos profissionais redundantes quando o nome já indica a profissão:
   - "nutricionistajuliana" → "Juliana" (redundante)
   - "clinica_boaforma" → "Clinica Boa Forma" (NÃO remover - faz parte do nome)
   - "academia_silva" → "Academia Silva" (NÃO remover - faz parte do nome)
6. Retorne o nome capitalizado, com acentos corrigidos quando aplicável
7. Para empresas, mantenha o tipo no nome (Clínica, Academia, Espaço, etc.)

EXEMPLOS:
- "nutricionistajulianacorrea" → "Juliana Correa"
- "dra.silvialeitefaria" → "Silvia Leite Faria"
- "personaltrainer.bianca" → "Bianca"
- "clinica_boaforma" → "Clinica Boa Forma"
- "academia_silva" → "Academia Silva"
- "espacosaude" → "Espaço Saúde"
- "centromedico" → "Centro Médico"
- "analuizaantunes" → "Ana Luiza Antunes"
- "_alanguimmaraes" → "Alan Guimarães"
- "malumorini" → "Malu Morini"
- "castro_mandinha" → "Castro Mandinha"
- "matheussonda_" → "Matheus Sonda"
- "dihsofia" → "Dih Sofia"
- "nathalia.sto" → "Nathalia Sto"
- "santana.matheuss" → "Santana Matheus"
- "musculacaoeremedio" → "Musculação e Remédio"
- "cortes_musculacao" → "Cortes Musculação"
- "dicas.muscular" → "Dicas Muscular"`
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
    return result || null;

  } catch (error: any) {
    console.log(`Erro: ${error.message}`);
    return null;
  }
}

// Testar os casos que estavam falhando
const problematicCases = [
  '_alanguimmaraes',
  'analuizaantunes',
  'castro_mandinha',
  'malumorini',
  'matheussonda_',
  'dihsofia',
  'nathalia.sto',
  'santana.matheuss',
  'clinica_boaforma',
  'academia_silva',
  'musculacaoeremedio',
  'cortes_musculacao',
  'dicas.muscular',
  'agabi__',
  'jimbv'
];

(async () => {
  console.log('🧪 TESTANDO PROMPT MELHORADO:\n');

  for (const username of problematicCases) {
    const extracted = await extractNameWithAI(username);
    console.log(`@${username.padEnd(30)} → ${extracted || '(falhou)'}`);
  }
})();
