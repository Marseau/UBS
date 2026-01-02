/**
 * Queue Management Routes
 *
 * Endpoints para enfileirar mensagens e gerenciar filas
 * - Instagram DMs
 * - WhatsApp Messages
 */

import { Router, Request, Response } from 'express';
import { queueManager } from '../services/queue-manager.service';

const router = Router();

/**
 * POST /api/queue/instagram-dm
 * Enfileirar Instagram DM
 */
router.post('/instagram-dm', async (req: Request, res: Response) => {
  try {
    const { conversationId, leadUsername, messageText, campaignId, priority } = req.body;

    // Validação
    if (!conversationId || !leadUsername || !messageText) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: conversationId, leadUsername, messageText',
      });
    }

    // Enfileirar
    const jobId = await queueManager.enqueueInstagramDM(
      {
        conversationId,
        leadUsername,
        messageText,
        campaignId,
      },
      priority || 5
    );

    return res.json({
      success: true,
      message: 'Instagram DM enqueued successfully',
      jobId,
    });
  } catch (error: any) {
    console.error('[Queue API] Error enqueuing Instagram DM:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to enqueue Instagram DM',
      error: error.message,
    });
  }
});

/**
 * POST /api/queue/whatsapp-message
 * Enfileirar mensagem WhatsApp
 */
router.post('/whatsapp-message', async (req: Request, res: Response) => {
  try {
    const { tenantId, phoneNumber, messageText, mediaUrl, priority } = req.body;

    // Validação
    if (!tenantId || !phoneNumber || !messageText) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: tenantId, phoneNumber, messageText',
      });
    }

    // Enfileirar
    const jobId = await queueManager.enqueueWhatsAppMessage(
      {
        tenantId,
        phoneNumber,
        messageText,
        mediaUrl,
      },
      priority || 5
    );

    return res.json({
      success: true,
      message: 'WhatsApp message enqueued successfully',
      jobId,
    });
  } catch (error: any) {
    console.error('[Queue API] Error enqueuing WhatsApp message:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to enqueue WhatsApp message',
      error: error.message,
    });
  }
});

/**
 * GET /api/queue/stats
 * Obter estatísticas das filas
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await queueManager.getQueueStats();

    return res.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.error('[Queue API] Error getting queue stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get queue stats',
      error: error.message,
    });
  }
});

/**
 * POST /api/queue/clear
 * Limpar todas as filas (DESENVOLVIMENTO APENAS)
 */
router.post('/clear', async (req: Request, res: Response) => {
  try {
    // Apenas em desenvolvimento
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Queue clearing is not allowed in production',
      });
    }

    await queueManager.clearAllQueues();

    return res.json({
      success: true,
      message: 'All queues cleared successfully',
    });
  } catch (error: any) {
    console.error('[Queue API] Error clearing queues:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear queues',
      error: error.message,
    });
  }
});

/**
 * POST /api/queue/instagram-dm/enqueue
 * Endpoint compatível com workflow N8N
 * Alias para /api/queue/instagram-dm
 */
router.post('/instagram-dm/enqueue', async (req: Request, res: Response) => {
  try {
    const { conversationId, leadUsername, messageText, campaignId, priority } = req.body;

    if (!conversationId || !leadUsername || !messageText) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: conversationId, leadUsername, messageText',
      });
    }

    const jobId = await queueManager.enqueueInstagramDM(
      {
        conversationId,
        leadUsername,
        messageText,
        campaignId,
      },
      priority || 5
    );

    return res.json({
      success: true,
      message: 'Instagram DM enqueued successfully',
      jobId,
      queuePosition: 'pending', // BullMQ will handle positioning
    });
  } catch (error: any) {
    console.error('[Queue API] Error enqueuing Instagram DM (N8N endpoint):', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to enqueue Instagram DM',
      error: error.message,
    });
  }
});

export default router;
