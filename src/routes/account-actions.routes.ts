import { Router, Request, Response } from 'express';
import { AccountActionsNotifierService } from '../services/account-actions-notifier.service';

const router = Router();

/**
 * POST /api/instagram/account-action
 * Webhook para registrar ações da conta e enviar notificação Telegram
 */
router.post('/account-action', async (req: Request, res: Response) => {
  try {
    const {
      source_platform,
      username,
      action_type,
      lead_id,
      campaign_id,
      comment_text,
      dm_text,
      success,
      error_message,
    } = req.body;

    // Validações básicas
    if (!username || !action_type) {
      return res.status(400).json({
        error: 'Missing required fields: username, action_type',
      });
    }

    const validActionTypes = [
      'follow', 'unfollow', 'like', 'comment', 'dm', 'story_view',
      'like_received', 'comment_received', 'follow_received', 'dm_received',
      'whatsapp_sent', 'whatsapp_received', 'mention_received'
    ];
    if (!validActionTypes.includes(action_type)) {
      return res.status(400).json({
        error: `Invalid action_type. Must be one of: ${validActionTypes.join(', ')}`,
      });
    }

    // Buscar contador diário atual
    const todayCount = await AccountActionsNotifierService.getTodayActionCount(action_type);

    // Registrar ação e retornar dados completos (estrutura simplificada)
    const result = await AccountActionsNotifierService.recordAndNotify({
      source_platform: source_platform || 'instagram',
      username,
      action_type,
      lead_id,
      campaign_id,
      comment_text, // Usado apenas para formatação de mensagem
      dm_text,      // Usado apenas para formatação de mensagem
      success: success !== false, // Default true
      error_message,
    });

    return res.status(200).json({
      success: true,
      message: 'Action recorded successfully',
      daily_count: todayCount + 1,
      ...result, // Retorna action, lead, formatted_message
    });
  } catch (error: any) {
    console.error('[Account Actions Routes] Error:', error);
    return res.status(500).json({
      error: 'Failed to process action',
      details: error.message,
    });
  }
});

/**
 * GET /api/instagram/account-actions/today
 * Retorna estatísticas de ações de hoje
 */
router.get('/account-actions/today', async (req: Request, res: Response) => {
  try {
    const { data, error } = await (await import('../config/database')).supabase
      .from('account_actions_today_count')
      .select('*');

    if (error) throw error;

    res.status(200).json({
      success: true,
      data: data || [],
    });
  } catch (error: any) {
    console.error('[Account Actions Routes] Error fetching today stats:', error);
    res.status(500).json({
      error: 'Failed to fetch today stats',
      details: error.message,
    });
  }
});

/**
 * GET /api/instagram/account-actions/stats
 * Retorna estatísticas dos últimos 30 dias
 */
router.get('/account-actions/stats', async (req: Request, res: Response) => {
  try {
    const { data, error } = await (await import('../config/database')).supabase
      .from('account_actions_daily_stats')
      .select('*')
      .order('action_date', { ascending: false })
      .limit(30);

    if (error) throw error;

    res.status(200).json({
      success: true,
      data: data || [],
    });
  } catch (error: any) {
    console.error('[Account Actions Routes] Error fetching stats:', error);
    res.status(500).json({
      error: 'Failed to fetch stats',
      details: error.message,
    });
  }
});

/**
 * POST /api/instagram/account-action/check-limit
 * Verifica se pode executar ação (rate limiting)
 */
router.post('/account-action/check-limit', async (req: Request, res: Response) => {
  try {
    const { action_type, daily_limit } = req.body;

    if (!action_type || !daily_limit) {
      return res.status(400).json({
        error: 'Missing required fields: action_type, daily_limit',
      });
    }

    const canExecute = await AccountActionsNotifierService.canExecuteAction(
      action_type,
      daily_limit
    );

    const currentCount = await AccountActionsNotifierService.getTodayActionCount(action_type);

    return res.status(200).json({
      success: true,
      can_execute: canExecute,
      current_count: currentCount,
      daily_limit: daily_limit,
      remaining: Math.max(0, daily_limit - currentCount),
    });
  } catch (error: any) {
    console.error('[Account Actions Routes] Error checking limit:', error);
    return res.status(500).json({
      error: 'Failed to check limit',
      details: error.message,
    });
  }
});

export default router;
