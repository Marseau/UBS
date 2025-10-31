import express, { Request, Response } from 'express';
import { enrichSingleLead } from '../services/instagram-lead-enrichment.service';
import { ensureCorrectAccount, OperationType } from '../services/instagram-official-session.service';

const router = express.Router();

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

    // Garantir que está logado com conta não-oficial (scraping)
    await ensureCorrectAccount(OperationType.SCRAPING);

    // Enriquecer lead
    const result = await enrichSingleLead(lead);

    console.log(`   ✅ Lead enriquecido: ${result.sources.length} fontes`);

    // Mesclar dados originais + enriquecidos (não sobrescrever com null)
    const mergedData = {
      id: lead.id,
      username: lead.username,
      full_name: result.enriched.full_name || lead.full_name || null,
      first_name: result.enriched.first_name || lead.first_name || null,
      last_name: result.enriched.last_name || lead.last_name || null,
      email: result.enriched.email || lead.email || null,
      phone: result.enriched.phone || lead.phone || null,
      city: result.enriched.city || lead.city || null,
      state: result.enriched.state || lead.state || null,
      address: result.enriched.address || lead.address || null,
      zip_code: result.enriched.zip_code || lead.zip_code || null,
      business_category: result.enriched.business_category || lead.business_category || null,
      hashtags_bio: result.enriched.hashtags_bio || lead.hashtags_bio || [],
      sources: result.sources
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
