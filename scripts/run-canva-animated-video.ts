import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { CanvaAnimatedVideoGeneratorService } from '../src/services/canva-animated-video-generator.service';

/**
 * Executa o CanvaAnimatedVideoGeneratorService sem depender do servidor Express.
 * Fluxo:
 * 1. Faz upload do MP4 base para o bucket `editorial-videos`
 * 2. Invoca o serviço com os tweets fornecidos
 * 3. Loga o resultado (URL final + duração + custo)
 */
async function main(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar definidos no .env');
  }

  const baseVideoPath =
    process.env.BASE_VIDEO_PATH || '/Users/marseau/Downloads/UBS Template Base.mp4';

  if (!fs.existsSync(baseVideoPath)) {
    throw new Error(`Arquivo de vídeo base não encontrado em ${baseVideoPath}`);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const uploadBaseVideo = async (): Promise<string> => {
    const fileBuffer = fs.readFileSync(baseVideoPath);
    const sanitizedName = path.basename(baseVideoPath).replace(/\s+/g, '-').toLowerCase();
    const objectKey = `canva-base/${Date.now()}-${sanitizedName}`;

    console.log('📤 Fazendo upload do vídeo base para Supabase Storage...');
    const { data, error } = await supabase.storage
      .from('editorial-videos')
      .upload(objectKey, fileBuffer, {
        contentType: 'video/mp4',
        upsert: true
      });

    if (error) {
      throw new Error(`Erro ao subir vídeo base: ${error.message}`);
    }

    const {
      data: { publicUrl }
    } = supabase.storage.from('editorial-videos').getPublicUrl(data.path);

    console.log(`✅ Vídeo base disponível em: ${publicUrl}`);
    return publicUrl;
  };

  const threadTitle = 'Por Que Seus Leads Somem em 5 Minutos';
  const tweets = [
    'Já se perguntou por que 78% dos leads optam por quem responde primeiro? A urgência é mais poderosa que o preço.',
    'Estudos mostram que a primeira empresa a responder um lead tem 50% mais chance de conversão. (Harvard Business Review, 2023)',
    'A janela de 5 minutos é crítica; depois disso a probabilidade de contato despenca. (Forrester, 2022)',
    '73% dos leads não retornam após 1 hora sem resposta; a espera é inimiga da conversão. (HubSpot Research, 2023)',
    'Se sua equipe leva mais de 5 minutos para responder, você está perdendo vendas valiosas.',
    'O impacto de atrasos na resposta é direto: perda de interesse. Não deixe seu lead esfriar.',
    'Identificou essa dor? Descubra como otimizar seu tempo de resposta e manter o lead aquecido.'
  ];

  const ctaText = 'Acesse nosso site e transforme seu negócio!';
  const contentId = `thread1-${Date.now()}`;

  const baseVideoUrl = await uploadBaseVideo();

  console.log('🚀 Iniciando geração do vídeo animado...');
  const generator = new CanvaAnimatedVideoGeneratorService();
  const result = await generator.generateAnimatedVideo(
    baseVideoUrl,
    tweets,
    ctaText,
    contentId,
    threadTitle
  );

  console.log('\n🎉 Resultado final:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error('❌ Falha ao gerar vídeo:', error);
  process.exit(1);
});
