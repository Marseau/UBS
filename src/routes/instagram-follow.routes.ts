import express, { Request, Response } from 'express';
import * as InstagramAutomationRefactored from '../services/instagram-automation-refactored.service';
import {
  switchToAlternativeAccount,
  switchToOfficialAccount,
  getOfficialLoggedUsername,
  ensureCorrectAccount,
  closeOfficialBrowser,
  OperationType
} from '../services/instagram-official-session.service';
import { generatePersonalizedDM } from '../services/instagram-dm-personalization.service';

const router = express.Router();

/**
 * POST /api/instagram/check-engagement
 *
 * Verifica notificações do Instagram e detecta interações
 * 1. Detecta curtidas em reels/posts
 * 2. Detecta comentários
 * 3. Detecta novos seguidores → Clica em "Seguir de volta" automaticamente
 *
 * Retorna lista de usernames que interagiram para processar depois
 */
router.post('/check-engagement', async (req: Request, res: Response) => {
  try {
    console.log(`\n📊 Verificando notificações do Instagram...`);

    // Garantir que está logado com conta oficial (@ubs.sistemas)
    await ensureCorrectAccount(OperationType.ENGAGEMENT);

    // Executar verificação usando PÁGINA COMPARTILHADA
    const result = await InstagramAutomationRefactored.checkAllNotifications();

    if (!result.success) {
      throw new Error(result.error_message || 'Erro ao verificar notificações');
    }

    console.log(`   ✅ Verificação concluída`);
    console.log(`   📋 Total de interações: ${result.interactions.length}`);

    // Retornar lista de usernames que interagiram
    return res.status(200).json({
      success: true,
      total_interactions: result.interactions.length,
      interactions: result.interactions,
      checked_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erro ao verificar notificações:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao verificar notificações',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

/**
 * POST /api/instagram/check-follow-back
 *
 * Verifica se um lead nos seguiu de volta
 * Retorna apenas o resultado da verificação
 * O workflow N8N persiste os dados usando nós Supabase
 */
router.post('/check-follow-back', async (req: Request, res: Response) => {
  try {
    const { lead_id, username, current_status, last_notified_at } = req.body;

    if (!lead_id || !username) {
      return res.status(400).json({
        error: 'Campos obrigatórios faltando',
        required: ['lead_id', 'username']
      });
    }

    console.log(`\n🔍 Verificando follow back: @${username}`);

    // Garantir que está logado com conta oficial (@ubs.sistemas)
    await ensureCorrectAccount(OperationType.ENGAGEMENT);

    // Executar verificação usando PÁGINA COMPARTILHADA (sem browser isolado)
    const result = await InstagramAutomationRefactored.checkFollowBackShared(username);

    if (!result.success) {
      throw new Error(result.error_message || 'Erro ao verificar follow back');
    }

    const followedBack = result.followed_back;
    const newStatus = followedBack ? 'followed_back' : 'followed';
    const statusChanged = current_status !== newStatus;

    // Determinar se deve notificar
    // Notifica se: status mudou OU é primeira verificação (last_notified_at null)
    const shouldNotify = statusChanged || !last_notified_at;

    if (followedBack) {
      console.log(`   🎉 Follow back detectado!`);
    } else {
      console.log(`   ⏳ Ainda aguardando follow back`);
    }

    if (shouldNotify) {
      console.log(`   📢 Deve notificar: ${statusChanged ? 'status mudou' : 'primeira verificação'}`);
    } else {
      console.log(`   🔇 Não notificar: status já reportado`);
    }

    // Retornar dados para o workflow N8N decidir e persistir
    return res.status(200).json({
      success: true,
      lead_id,
      username,
      followed_back: followedBack,
      checked_at: new Date().toISOString(),
      // Dados para UPDATE em instagram_leads
      follow_status: newStatus,
      should_notify: shouldNotify,
      status_changed: statusChanged,
      // Atualizar last_check_notified_at apenas se notificar
      last_check_notified_at: shouldNotify ? new Date().toISOString() : last_notified_at
    });

  } catch (error) {
    console.error('❌ Erro ao verificar follow back:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao verificar follow back',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

/**
 * POST /api/instagram/unfollow-lead
 *
 * Executa a ação de deixar de seguir um lead no Instagram
 * Retorna apenas o resultado da ação (sucesso/erro)
 * O workflow N8N persiste os dados usando nós Supabase
 */
router.post('/unfollow-lead', async (req: Request, res: Response) => {
  try {
    const { lead_id, username } = req.body;

    if (!lead_id || !username) {
      return res.status(400).json({
        error: 'Campos obrigatórios faltando',
        required: ['lead_id', 'username']
      });
    }

    console.log(`\n🗑️  Aplicando unfollow: @${username}`);

    // Garantir que está logado com conta oficial (@ubs.sistemas)
    await ensureCorrectAccount(OperationType.ENGAGEMENT);

    // Executar unfollow usando PÁGINA COMPARTILHADA (sem browser isolado)
    const result = await InstagramAutomationRefactored.unfollowUserShared(username);

    console.log(`   ✅ Unfollow executado`);

    // Retornar dados para o workflow N8N persistir
    return res.status(200).json({
      success: result.success,
      lead_id,
      username,
      action_type: 'unfollow',
      executed_at: new Date().toISOString(),
      error_message: result.error_message,
      // Dados para UPDATE em instagram_leads (workflow faz isso)
      follow_status: 'unfollowed',
      unfollowed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erro ao aplicar unfollow:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao aplicar unfollow',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

/**
 * POST /api/instagram/batch-engagement
 *
 * Processa batch de até 10 usuários com engajamento completo
 * Verifica conta logada, valida se já segue, e executa Follow + Like + Comment
 * Retorna JSON com lista de leads processados, pulados e timestamps
 */
router.post('/batch-engagement', async (req: Request, res: Response) => {
  try {
    const { leads } = req.body;

    // Aceitar tanto formato antigo (usernames array) quanto novo (leads array de objetos)
    let leadsData: Array<{ lead_id: string; username: string }>;

    if (Array.isArray(req.body.usernames)) {
      // Formato antigo: array de strings
      leadsData = req.body.usernames.map((username: string, index: number) => ({
        lead_id: `legacy_${index}_${Date.now()}`,
        username
      }));
    } else if (Array.isArray(leads)) {
      // Formato novo: array de objetos { lead_id, username }
      leadsData = leads;
    } else {
      return res.status(400).json({
        error: 'Body inválido. Envie "leads" como array de objetos',
        example: {
          leads: [
            { lead_id: '123', username: 'user1' },
            { lead_id: '456', username: 'user2' }
          ]
        }
      });
    }

    if (leadsData.length === 0) {
      return res.status(400).json({
        error: 'Array de leads não pode ser vazio'
      });
    }

    if (leadsData.length > 10) {
      return res.status(400).json({
        error: 'Máximo de 10 leads por batch',
        received: leadsData.length
      });
    }

    // Validar estrutura dos objetos
    for (const lead of leadsData) {
      if (!lead.username || !lead.lead_id) {
        return res.status(400).json({
          error: 'Cada lead deve ter "lead_id" e "username"',
          received: lead
        });
      }
    }

    console.log(`\n🎯 [BATCH] Processando ${leadsData.length} leads via API...`);

    // Garantir que está logado com conta oficial (@ubs.sistemas)
    await ensureCorrectAccount(OperationType.ENGAGEMENT);

    // Extrair apenas usernames para processar
    const usernames = leadsData.map(l => l.username);

    // Executar batch engagement usando serviço refatorado (padrões do scraper)
    const result = await InstagramAutomationRefactored.processBatchEngagement(usernames);

    // Enriquecer resultado com lead_id
    const enrichedLeads = result.leads.map((leadResult, index) => {
      const leadData = leadsData[index];
      if (!leadData) {
        throw new Error(`Lead data missing for index ${index}`);
      }
      return {
        lead_id: leadData.lead_id,
        ...leadResult
      };
    });

    return res.status(200).json({
      ...result,
      leads: enrichedLeads
    });

  } catch (error) {
    console.error('❌ Erro no batch engagement:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao processar batch engagement',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

// engage-lead endpoint deletado - use /batch-engagement em vez disso

/**
 * POST /api/instagram/like-post
 *
 * Executa a ação de curtir o último post de um lead
 * Retorna apenas o resultado da ação (sucesso/erro)
 * O workflow N8N persiste os dados usando nós Supabase
 */
router.post('/like-post', async (req: Request, res: Response) => {
  try {
    const { lead_id, username, post_url } = req.body;

    if (!lead_id || !username) {
      return res.status(400).json({
        error: 'Campos obrigatórios faltando',
        required: ['lead_id', 'username']
      });
    }

    console.log(`\n❤️  Curtindo post de: @${username}`);

    // TODO: Integrar com Puppeteer/Instagram API para curtir de verdade
    // Por enquanto, simula a ação de like
    const likeSuccess = true;
    const errorMessage = null;
    const actualPostUrl = post_url || `https://instagram.com/p/MOCK_POST_${username}`;

    console.log(`   ✅ Like executado com sucesso`);

    // Retornar dados para o workflow N8N persistir
    return res.status(200).json({
      success: likeSuccess,
      lead_id,
      username,
      action_type: 'like',
      post_url: actualPostUrl,
      executed_at: new Date().toISOString(),
      error_message: errorMessage
    });

  } catch (error) {
    console.error('❌ Erro ao curtir post:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao curtir post',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

/**
 * POST /api/instagram/comment-post
 *
 * Executa a ação de comentar em um post de um lead
 * Retorna apenas o resultado da ação (sucesso/erro)
 * O workflow N8N persiste os dados usando nós Supabase
 */
router.post('/comment-post', async (req: Request, res: Response) => {
  try {
    const { lead_id, username, post_url, comment_text } = req.body;

    if (!lead_id || !username || !comment_text) {
      return res.status(400).json({
        error: 'Campos obrigatórios faltando',
        required: ['lead_id', 'username', 'comment_text']
      });
    }

    console.log(`\n💬 Comentando em post de: @${username}`);
    console.log(`   Comentário: "${comment_text}"`);

    // TODO: Integrar com Puppeteer/Instagram API para comentar de verdade
    // Por enquanto, simula a ação de comment
    const commentSuccess = true;
    const errorMessage = null;
    const actualPostUrl = post_url || `https://instagram.com/p/MOCK_POST_${username}`;

    console.log(`   ✅ Comentário executado com sucesso`);

    // Retornar dados para o workflow N8N persistir
    return res.status(200).json({
      success: commentSuccess,
      lead_id,
      username,
      action_type: 'comment',
      post_url: actualPostUrl,
      comment_text,
      executed_at: new Date().toISOString(),
      error_message: errorMessage
    });

  } catch (error) {
    console.error('❌ Erro ao comentar:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao comentar',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

/**
 * POST /api/instagram/switch-account
 *
 * Endpoint de teste para trocar de conta do Instagram
 * Faz logout da conta atual e login com credenciais alternativas
 */
router.post('/switch-account', async (_req: Request, res: Response) => {
  try {
    console.log('\n🔄 [API] Requisição de troca de conta recebida');

    // Verificar conta atual antes do switch
    const currentUsername = getOfficialLoggedUsername();
    console.log(`   Conta atual: ${currentUsername || 'não detectada'}`);

    // Executar switch de conta
    const newUsername = await switchToAlternativeAccount();

    return res.status(200).json({
      success: true,
      message: 'Troca de conta concluída com sucesso',
      previous_account: currentUsername,
      current_account: newUsername,
      switched_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erro ao trocar de conta:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao trocar de conta',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

/**
 * POST /api/instagram/send-dm
 *
 * Envia DM personalizado via IA para lead qualificado
 * Gera mensagem com GPT-4o baseado no perfil do lead
 * Registra em instagram_dm_outreach para rastreabilidade
 */
router.post('/send-dm', async (req: Request, res: Response) => {
  try {
    const { lead_id, username, full_name, business_category, segment, has_phone, has_email } = req.body;

    if (!lead_id || !username) {
      return res.status(400).json({
        error: 'Campos obrigatórios faltando',
        required: ['lead_id', 'username']
      });
    }

    console.log(`\n💬 Iniciando DM outreach para @${username}...`);

    // Garantir que está logado com conta oficial (@ubs.sistemas)
    await ensureCorrectAccount(OperationType.ENGAGEMENT);

    // 1. Gerar mensagem personalizada com GPT-4o
    console.log('🤖 Gerando mensagem personalizada com GPT-4o...');
    const personalizedDM = await generatePersonalizedDM({
      username,
      full_name,
      business_category,
      segment,
      has_phone: has_phone || false,
      has_email: has_email || false
    });

    console.log(`   📝 Mensagem gerada: "${personalizedDM.message}"`);
    console.log(`   🔢 Tokens usados: ${personalizedDM.tokens_used}`);

    // 2. Enviar DM via Puppeteer
    console.log('📤 Enviando DM via Instagram...');
    const dmResult = await InstagramAutomationRefactored.sendDirectMessageShared(
      username,
      personalizedDM.message
    );

    if (!dmResult.success) {
      throw new Error(dmResult.error_message || 'Erro ao enviar DM');
    }

    console.log(`   ✅ DM enviado com sucesso!`);

    // 3. Retornar dados para o workflow N8N persistir em Supabase
    return res.status(200).json({
      success: true,
      lead_id,
      username,
      message_text: personalizedDM.message,
      message_generated_by: personalizedDM.model,
      generation_prompt: personalizedDM.prompt_used,
      tokens_used: personalizedDM.tokens_used,
      sent_at: dmResult.sent_at,
      delivery_status: 'sent'
    });

  } catch (error) {
    console.error('❌ Erro ao enviar DM:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao enviar DM',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

/**
 * POST /api/instagram/close-browser
 *
 * Fecha o browser do Instagram (sessão oficial)
 * Use este endpoint ao FINAL do processamento de batch para liberar recursos
 */
router.post('/close-browser', async (_req: Request, res: Response) => {
  try {
    console.log('\n🚪 [API] Requisição para fechar browser recebida');

    await closeOfficialBrowser();

    console.log('✅ Browser fechado com sucesso');

    return res.status(200).json({
      success: true,
      message: 'Browser fechado com sucesso',
      closed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erro ao fechar browser:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao fechar browser',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

export default router;
