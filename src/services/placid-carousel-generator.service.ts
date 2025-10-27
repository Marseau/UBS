import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface CarouselSlide {
  slide_number: string;
  main_title: string;
  subtitle?: string;
  content: string;
  footer?: string;
  background_color?: string;
}

interface PlacidImageResponse {
  image_url: string | null;
  status: string;
  polling_url?: string;
  poll_url?: string; // Legacy field
}

interface CarouselGenerationResult {
  carousel_urls: string[];
  total_slides: number;
  content_id: string;
  cost_usd: number;
}

export class PlacidCarouselGeneratorService {
  private readonly PLACID_API_KEY: string;
  private readonly PLACID_TEMPLATE_ID: string;
  private readonly PLACID_BASE_URL = 'https://api.placid.app/api/rest';
  private readonly supabase;

  constructor() {
    this.PLACID_API_KEY = process.env.PLACID_API_KEY || '';
    this.PLACID_TEMPLATE_ID = process.env.PLACID_TEMPLATE_ID || '';

    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    if (!this.PLACID_API_KEY) {
      console.warn('⚠️ PLACID_API_KEY not set!');
    }
    if (!this.PLACID_TEMPLATE_ID) {
      console.warn('⚠️ PLACID_TEMPLATE_ID not set!');
    }
  }

  /**
   * Gera um carrossel de imagens para Instagram usando Placid API
   * @param xThreadContent - Conteúdo do thread X (formato "Slide 1: título\n\nconteúdo...")
   * @param contentId - ID do conteúdo editorial
   */
  async generateCarousel(
    xThreadContent: string,
    contentId: string
  ): Promise<CarouselGenerationResult> {
    console.log('🎨 ========== INICIANDO GERAÇÃO CARROSSEL PLACID ==========');
    console.log(`📄 Content ID: ${contentId}`);

    // Parsear o conteúdo do X thread para slides
    const slides = this.parseXThreadToSlides(xThreadContent);
    console.log(`📊 Total de slides identificados: ${slides.length}`);

    if (slides.length === 0) {
      throw new Error('Nenhum slide encontrado no conteúdo X thread');
    }

    const imageUrls: string[] = [];

    // Gerar cada slide via Placid API
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      if (!slide) continue;

      console.log(`\n🎬 Gerando slide ${i + 1}/${slides.length}...`);

      const imageUrl = await this.generateSlideImage(slide);

      if (imageUrl) {
        console.log(`✅ Slide ${i + 1} gerado: ${imageUrl.substring(0, 60)}...`);
        imageUrls.push(imageUrl);
      } else {
        console.warn(`⚠️ Falha ao gerar slide ${i + 1}`);
      }
    }

    console.log(`\n✅ Carrossel completo: ${imageUrls.length}/${slides.length} slides gerados`);

    // Custo Placid: Plano gratuito 50 imagens/mês, depois $19/mês (250 imagens)
    // Custo por imagem: ~$0.076 (após free tier)
    const costPerImage = 0.076;
    const totalCost = imageUrls.length * costPerImage;

    return {
      carousel_urls: imageUrls,
      total_slides: imageUrls.length,
      content_id: contentId,
      cost_usd: totalCost
    };
  }

  /**
   * Parseia o conteúdo do X thread para estrutura de slides
   */
  private parseXThreadToSlides(xThreadContent: string): CarouselSlide[] {
    const slides: CarouselSlide[] = [];

    // Dividir por "Slide X:"
    const slideMatches = xThreadContent.split(/Slide \d+:/i);

    for (let i = 1; i < slideMatches.length; i++) {
      const slideContent = (slideMatches[i] || '').trim();

      // Extrair título (primeira linha até quebra dupla)
      const lines = slideContent.split('\n\n');
      const title = (lines[0] || '').trim();
      const content = lines.slice(1).join('\n\n').trim();

      slides.push({
        slide_number: `${i}/${slideMatches.length - 1}`,
        main_title: title,
        content: content,
        footer: 'ubs.app.br',
        background_color: '#ffffff'
      });
    }

    return slides;
  }

  /**
   * Gera uma única imagem via Placid API
   */
  private async generateSlideImage(slide: CarouselSlide): Promise<string | null> {
    try {
      console.log('📤 Enviando request para Placid API...');
      console.log(`📡 URL: ${this.PLACID_BASE_URL}/images`);
      console.log(`🔑 Template: ${this.PLACID_TEMPLATE_ID}`);
      console.log(`📝 Payload:`, JSON.stringify({
        template_uuid: this.PLACID_TEMPLATE_ID,
        layers: {
          slide_number: { text: slide.slide_number },
          main_title: { text: slide.main_title },
          content: { text: slide.content },
          footer: { text: slide.footer || 'ubs.app.br' }
        }
      }, null, 2));

      const response = await axios.post(
        `${this.PLACID_BASE_URL}/images`,
        {
          template_uuid: this.PLACID_TEMPLATE_ID,
          layers: {
            slide_number: {
              text: slide.slide_number
            },
            main_title: {
              text: slide.main_title
            },
            content: {
              text: slide.content
            },
            footer: {
              text: slide.footer || 'ubs.app.br'
            }
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.PLACID_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ Response from Placid:', JSON.stringify(response.data, null, 2));

      const data = response.data as PlacidImageResponse;

      // Placid retorna a imagem imediatamente ou URL para polling
      if (data.image_url) {
        return data.image_url;
      } else if (data.polling_url || data.poll_url) {
        // Esperar até a imagem ficar pronta (polling)
        const pollUrl = data.polling_url || data.poll_url!;
        console.log(`🔄 Iniciando polling para: ${pollUrl}`);
        return await this.pollForImage(pollUrl);
      }

      console.warn('⚠️ Placid API retornou resposta sem image_url nem polling_url');
      return null;
    } catch (error: any) {
      console.error(`❌ Erro ao gerar imagem Placid: ${error.message}`);
      console.error(`❌ Status: ${error.response?.status}`);
      console.error(`❌ Status Text: ${error.response?.statusText}`);
      if (error.response?.data) {
        console.error('❌ Response Data:', JSON.stringify(error.response.data, null, 2));
      }
      if (error.config) {
        console.error('❌ Request Config:', JSON.stringify({
          url: error.config.url,
          method: error.config.method,
          headers: error.config.headers
        }, null, 2));
      }
      return null;
    }
  }

  /**
   * Faz polling até a imagem ficar pronta
   */
  private async pollForImage(pollUrl: string, maxAttempts = 10): Promise<string | null> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Espera 2s

      try {
        const response = await axios.get(pollUrl, {
          headers: {
            'Authorization': `Bearer ${this.PLACID_API_KEY}`
          }
        });

        const data = response.data as PlacidImageResponse;

        if (data.status === 'finished' && data.image_url) {
          return data.image_url;
        }

        console.log(`⏳ Aguardando geração... (tentativa ${attempt}/${maxAttempts})`);
      } catch (error: any) {
        console.error(`❌ Erro no polling: ${error.message}`);
      }
    }

    return null;
  }

  /**
   * Faz upload de uma imagem para Supabase Storage
   */
  private async uploadToSupabase(imageUrl: string, contentId: string, slideIndex: number): Promise<string> {
    try {
      // Download da imagem
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(response.data);

      // Upload para Supabase
      const fileName = `carousel-${contentId}-slide-${slideIndex}-${Date.now()}.png`;
      const { data, error } = await this.supabase.storage
        .from('instagram-reels')
        .upload(fileName, imageBuffer, {
          contentType: 'image/png',
          upsert: true
        });

      if (error) {
        throw error;
      }

      // Gerar URL pública
      const { data: publicUrlData } = this.supabase.storage
        .from('instagram-reels')
        .getPublicUrl(fileName);

      return publicUrlData.publicUrl;
    } catch (error: any) {
      console.error(`❌ Erro no upload para Supabase: ${error.message}`);
      // Retornar URL original do Placid se upload falhar
      return imageUrl;
    }
  }
}
