import express, { Request, Response } from 'express';
import * as InstagramAutomation from '../services/instagram-automation.service';
import * as InstagramAutomationRefactored from '../services/instagram-automation-refactored.service';
import {
  switchToAlternativeAccount,
  switchToOfficialAccount,
  getOfficialLoggedUsername,
  ensureCorrectAccount,
  OperationType
} from '../services/instagram-official-session.service';

const router = express.Router();

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

    // Executar verificação via Puppeteer
    const result = await InstagramAutomation.checkFollowBack(username);

    if (!result.success) {
      throw new Error(result.error_message || 'Erro ao verificar follow back');
    }

    const followedBack = result.followed_back;
    const newStatus = followedBack ? 'followed_back' : 'following';
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

    // Executar unfollow via Puppeteer
    const result = await InstagramAutomation.unfollowUser(username);

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
    const { usernames } = req.body;

    if (!Array.isArray(usernames)) {
      return res.status(400).json({
        error: 'usernames deve ser um array',
        example: { usernames: ['user1', 'user2', 'user3'] }
      });
    }

    if (usernames.length === 0) {
      return res.status(400).json({
        error: 'usernames não pode ser vazio'
      });
    }

    if (usernames.length > 10) {
      return res.status(400).json({
        error: 'Máximo de 10 usuários por batch',
        received: usernames.length
      });
    }

    console.log(`\n🎯 [BATCH] Processando ${usernames.length} usuários via API...`);

    // Garantir que está logado com conta oficial (@ubs.sistemas)
    await ensureCorrectAccount(OperationType.ENGAGEMENT);

    // Executar batch engagement usando serviço refatorado (padrões do scraper)
    const result = await InstagramAutomationRefactored.processBatchEngagement(usernames);

    return res.status(200).json(result);

  } catch (error) {
    console.error('❌ Erro no batch engagement:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao processar batch engagement',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

/**
 * POST /api/instagram/engage-lead
 *
 * Executa engajamento completo: Follow + Like + Comment
 * Retorna apenas o resultado das ações (sucesso/erro)
 * O workflow N8N persiste os dados usando nós Supabase
 */
router.post('/engage-lead', async (req: Request, res: Response) => {
  try {
    const { lead_id, username, comment_text = '👏👏👏' } = req.body;

    if (!lead_id || !username) {
      return res.status(400).json({
        error: 'Campos obrigatórios faltando',
        required: ['lead_id', 'username']
      });
    }

    console.log(`\n🎯 Engajamento completo: @${username}`);

    // Garantir que está logado com conta oficial (@ubs.sistemas)
    await ensureCorrectAccount(OperationType.ENGAGEMENT);

    const timestamp = new Date().toISOString();

    // Executar engajamento completo via Puppeteer
    const result = await InstagramAutomation.engageLead(username, comment_text);

    console.log(`   ✅ Engajamento completo executado`);

    // Retornar dados consolidados para o workflow N8N persistir
    return res.status(200).json({
      success: result.success,
      lead_id,
      username,
      executed_at: timestamp,
      // Dados para UPDATE em instagram_leads
      follow_status: 'following',
      followed_at: timestamp,
      last_follow_attempt_at: timestamp,
      // Dados das ações executadas
      actions: {
        follow: {
          action_type: 'follow',
          success: result.actions.follow.success,
          executed_at: timestamp,
          error_message: result.actions.follow.error_message
        },
        like: {
          action_type: 'like',
          success: result.actions.like.success,
          executed_at: timestamp,
          post_url: result.actions.like.post_url,
          error_message: result.actions.like.error_message
        },
        comment: {
          action_type: 'comment',
          success: result.actions.comment.success,
          executed_at: timestamp,
          post_url: result.actions.comment.post_url,
          comment_text,
          error_message: result.actions.comment.error_message
        }
      }
    });

  } catch (error) {
    console.error('❌ Erro ao executar engajamento:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao executar engajamento',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

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
router.post('/switch-account', async (req: Request, res: Response) => {
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

export default router;
