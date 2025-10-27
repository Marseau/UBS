import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const testContent = {
  week_number: 1,
  day_of_week: 'monday',
  x_thread_part1: `Slide 1:
30% dos agendamentos falham em PMEs (HubSpot, 2024)

👉 Sua agenda está vazando receita?

Slide 2:
Agendamento manual = caos:

📲 WhatsApp + planilhas + telefone
❌ Zero integração
💥 Equipe sobrecarregada

Slide 3:
Exemplo:

Salão com 5 profissionais
2 faltas/semana cada → R$1.500/semana perdidos
Anual: R$78.000 indo embora

Slide 4:
Consequências:

1️⃣ Agenda furada
2️⃣ Clientes frustrados
3️⃣ Profissionais desmotivados

Slide 5:
E piora quando:

⚠️ Sem lembretes
⚠️ Agenda compartilhada
⚠️ Cliente muda última hora

Slide 6:
Sintomas claros:

✅ Tudo manual
✅ Não sabe quem confirmou
✅ Muitos cancelamentos

Slide 7:
👉 Resumindo: sua agenda pode estar drenando receita.

Salve este carrossel e siga para aprender como evitar!`,
  instagram_caption: '30% dos agendamentos falham em PMEs. Sua agenda está vazando receita? 💰'
};

async function testPlacidCarousel() {
  console.log('🎨 ========== TESTE PLACID CAROUSEL ==========\n');

  try {
    // 1. Inserir conteúdo de teste
    console.log('📝 Inserindo conteúdo de teste no banco...');
    const { data: insertedContent, error: insertError } = await supabase
      .from('editorial_content')
      .insert([testContent])
      .select()
      .single();

    if (insertError) {
      throw new Error(`Erro ao inserir: ${insertError.message}`);
    }

    console.log(`✅ Conteúdo inserido com ID: ${insertedContent.id}\n`);

    // 2. Chamar API para gerar carrossel
    console.log('🎬 Chamando API para gerar carrossel...');
    const apiUrl = `http://localhost:3000/api/placid-carousel/generate/${insertedContent.id}`;

    console.log(`📡 POST ${apiUrl}\n`);

    const response = await axios.post(apiUrl);

    console.log('✅ Resposta da API:');
    console.log(JSON.stringify(response.data, null, 2));

    console.log('\n📊 Resumo:');
    console.log(`   Content ID: ${response.data.content_id}`);
    console.log(`   Total de slides: ${response.data.total_slides}`);
    console.log(`   Custo: $${response.data.cost}`);
    console.log('\n📸 URLs das imagens geradas:');
    response.data.carousel_urls.forEach((url: string, index: number) => {
      console.log(`   ${index + 1}. ${url}`);
    });

    console.log('\n✅ Teste concluído com sucesso!');
    console.log(`\n👉 Visualize as imagens em: ${response.data.carousel_urls[0]}`);

  } catch (error: any) {
    console.error('\n❌ Erro no teste:', error.message);
    if (error.response?.data) {
      console.error('Resposta da API:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testPlacidCarousel();
