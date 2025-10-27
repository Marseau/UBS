import { config } from 'dotenv';
import OpenAI from 'openai';

config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

async function extractContactsWithAI(bio: string): Promise<{ email: string | null; phone: string | null }> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Você é um especialista em extrair informações de contato de biografias do Instagram.

TAREFA:
Extraia EMAIL e TELEFONE da bio, se existirem.

REGRAS:
1. Identifique emails mesmo escritos de forma criativa (ex: "gmail ponto com", "arroba", etc.)
2. Identifique telefones em qualquer formato (com/sem DDD, com/sem código do país)
3. Ignore emails genéricos (noreply@, no-reply@)
4. Retorne em formato JSON: {"email": "...", "phone": "..."}
5. Se não encontrar, use null

EXEMPLOS DE BIO:
- "📧 contato arroba gmail.com | 📱11 99999-9999" → {"email": "contato@gmail.com", "phone": "11999999999"}
- "WhatsApp: (11) 98765-4321" → {"email": null, "phone": "11987654321"}
- "Email para parcerias: maria ponto silva @ outlook" → {"email": "maria.silva@outlook.com", "phone": null}
- "Consultoria 🔥" → {"email": null, "phone": null}`
        },
        {
          role: 'user',
          content: `Bio: ${bio}`
        }
      ],
      temperature: 0.3,
      max_tokens: 100,
      response_format: { type: "json_object" }
    });

    const result = response.choices[0]?.message?.content?.trim();

    if (!result) {
      return { email: null, phone: null };
    }

    return JSON.parse(result);

  } catch (error: any) {
    console.log(`Erro: ${error.message}`);
    return { email: null, phone: null };
  }
}

// Testes com bios criativas
const testBios = [
  '📧 contato arroba gmail ponto com | 📱 (11) 99999-9999',
  'WhatsApp: 11 98765-4321 💬',
  'Email: maria ponto silva @ outlook.com',
  'Fale comigo no gmail: joao123',
  '🔥 Nutricionista | 📱 11-987654321',
  'Entre em contato: meu email é contato at dominio dot com',
  'Parcerias: parceria[arroba]empresa.com.br',
  'Tel: (11) 3456-7890 | Email: info@clinica.com'
];

(async () => {
  console.log('🤖 Testando extração de contatos da bio com GPT-4o Mini:\n');

  for (const bio of testBios) {
    const result = await extractContactsWithAI(bio);
    console.log(`Bio: "${bio}"`);
    console.log(`   Email: ${result.email || '(não encontrado)'}`);
    console.log(`   Phone: ${result.phone || '(não encontrado)'}\n`);
  }
})();
