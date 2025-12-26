import express, { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { enrichSingleLead } from '../services/instagram-lead-enrichment.service';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/instagram/enrich-lead
 *
 * Enriquece um único lead do Instagram
 * Usado pelo workflow N8N
 */
router.post('/enrich-lead', express.text({ type: '*/*', limit: '10mb' }), async (req: Request, res: Response) => {
  try {
    // Parse manual do JSON para lidar com caracteres especiais
    let lead: any;
    try {
      lead = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (parseError) {
      // Se falhar, tentar limpar caracteres problemáticos
      const cleanBody = typeof req.body === 'string'
        ? req.body.replace(/\\"/g, '\\\\"')
        : JSON.stringify(req.body);
      lead = JSON.parse(cleanBody);
    }

    // Validar campos obrigatórios
    if (!lead.id || !lead.username) {
      return res.status(400).json({
        error: 'Campos obrigatórios faltando',
        required: ['id', 'username']
      });
    }

    console.log(`\n🔍 Enriquecendo lead via API: @${lead.username}`);

    // Enriquecer lead (apenas análise de IA, sem Puppeteer)
    const result = await enrichSingleLead(lead);

    console.log(`   ✅ Lead enriquecido: ${result.sources.length} fontes`);

    // Determinar status de extração de WhatsApp da bio/website
    const whatsappNumbers = result.enriched.whatsapp_numbers || [];
    const whatsappBioStatus = whatsappNumbers.length > 0 ? 'found' : 'none';

    console.log(`   📱 WhatsApp: ${whatsappNumbers.length} encontrados (status: ${whatsappBioStatus})`);

    // PERSISTIR diretamente no banco (sem depender do N8N)
    // Filtrar apenas WhatsApps extraídos da bio (source: 'bio')
    const bioWhatsApps = whatsappNumbers.filter((w: any) => w.source === 'bio');

    // Buscar whatsapp_numbers existentes para merge
    const { data: existingLead } = await supabase
      .from('instagram_leads')
      .select('whatsapp_numbers')
      .eq('id', lead.id)
      .single();

    const existingNumbers: Array<{number: string; source: string; extracted_at: string}> = existingLead?.whatsapp_numbers || [];
    const existingSet = new Set(existingNumbers.map(w => w.number));

    // Adicionar novos WhatsApps da bio (sem duplicatas)
    for (const w of bioWhatsApps) {
      if (!existingSet.has(w.number)) {
        existingNumbers.push(w);
        existingSet.add(w.number);
      }
    }

    // Determinar status: 'found' se tem WhatsApp da bio, 'none' se não
    const finalBioStatus = bioWhatsApps.length > 0 ? 'found' : 'none';

    // 🎯 ALTA CERTEZA: Filtrar números verificados
    // Fontes aceitas: website_wa_me (link wa.me), bio (com contexto WhatsApp)
    // Só números normalizados Brasil (começam com 55, 12-13 dígitos)
    const highCertaintySources = ['website_wa_me', 'bio'];
    const verifiedNumbers = existingNumbers.filter((w: any) =>
      highCertaintySources.includes(w.source) &&
      w.number.startsWith('55') &&
      w.number.length >= 12 &&
      w.number.length <= 13
    );

    // Preparar dados para update
    const updateData: any = {
      whatsapp_numbers: existingNumbers,
      whatsapp_bio_status: finalBioStatus,
      whatsapp_verified: verifiedNumbers  // 🆕 Apenas números de alta certeza
    };

    // Popular whatsapp_number com o primeiro número verificado
    if (verifiedNumbers.length > 0 && verifiedNumbers[0]) {
      updateData.whatsapp_number = verifiedNumbers[0].number;
      updateData.whatsapp_source = verifiedNumbers[0].source;
      console.log(`   📱 WhatsApp verificados: ${verifiedNumbers.length} números`);
      verifiedNumbers.forEach((w: any) => console.log(`      ✅ ${w.number} [${w.source}]`));
    }

    // Persistir no banco
    const { error: updateError } = await supabase
      .from('instagram_leads')
      .update(updateData)
      .eq('id', lead.id);

    if (updateError) {
      console.error(`   ⚠️ Erro ao persistir: ${updateError.message}`);
    } else {
      console.log(`   💾 Persistido: whatsapp_bio_status=${finalBioStatus}, total=${existingNumbers.length}, verificados=${verifiedNumbers.length}`);
    }

    // Mesclar dados originais + enriquecidos (não sobrescrever com null)
    const mergedData = {
      id: lead.id,
      username: lead.username,
      full_name: result.enriched.full_name || lead.full_name || null,
      first_name: result.enriched.first_name || lead.first_name || null,
      last_name: result.enriched.last_name || lead.last_name || null,
      profession: result.enriched.profession || lead.profession || null,
      email: result.enriched.email || lead.email || null,
      phone: result.enriched.phone || lead.phone || null,
      whatsapp_numbers: whatsappNumbers, // WhatsApp numbers com fonte
      whatsapp_bio_status: whatsappBioStatus, // Status da extração: 'found' ou 'none'
      city: result.enriched.city || lead.city || null,
      state: result.enriched.state || lead.state || null,
      address: result.enriched.address || lead.address || null,
      zip_code: result.enriched.zip_code || lead.zip_code || null,
      business_category: result.enriched.business_category || lead.business_category || null,
      hashtags_bio: result.enriched.hashtags_bio || lead.hashtags_bio || [],
      sources: result.sources,
      url_enriched: result.url_enriched // true se não há URL, false se há URL pendente
    };

    // Retornar dados mesclados prontos para UPDATE
    return res.status(200).json(mergedData);

  } catch (error) {
    console.error('❌ Erro ao enriquecer lead:', error);

    return res.status(500).json({
      error: 'Erro ao enriquecer lead',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

/**
 * POST /api/instagram/enrich-batch
 *
 * Enriquece múltiplos leads em batch
 * Usado pelo workflow N8N para processar lotes
 */
router.post('/enrich-batch', async (req: Request, res: Response) => {
  try {
    const { leads } = req.body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({
        error: 'Campo "leads" deve ser um array não vazio'
      });
    }

    console.log(`\n📊 Enriquecendo batch de ${leads.length} leads via API`);

    const results: any[] = [];
    const errors: any[] = [];

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];

      try {
        console.log(`\n[${i + 1}/${leads.length}] @${lead.username}`);
        const result = await enrichSingleLead(lead);
        results.push(result);

        // Delay de 500ms entre chamadas para evitar rate limiting
        if (i < leads.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error) {
        console.error(`   ❌ Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        errors.push({
          username: lead.username,
          error: error instanceof Error ? error.message : 'Erro desconhecido'
        });

        // Adicionar resultado vazio para não travar o fluxo
        results.push({
          id: lead.id,
          username: lead.username,
          enriched: {},
          sources: [],
          should_mark_enriched: true
        });
      }
    }

    console.log(`\n✅ Batch processado: ${results.length} leads`);
    if (errors.length > 0) {
      console.log(`⚠️  ${errors.length} erros encontrados`);
    }

    return res.status(200).json({
      success: true,
      total: leads.length,
      processed: results.length,
      errorCount: errors.length,
      results,
      errorDetails: errors
    });

  } catch (error) {
    console.error('❌ Erro ao processar batch:', error);

    return res.status(500).json({
      error: 'Erro ao processar batch',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

export default router;
