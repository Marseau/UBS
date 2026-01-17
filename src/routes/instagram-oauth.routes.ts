/**
 * Instagram OAuth Routes
 *
 * Rotas para autenticação OAuth com Instagram/Facebook
 *
 * Fluxo:
 * 1. GET /api/instagram/oauth/authorize?campaignId=xxx - Inicia OAuth
 * 2. GET /api/instagram/oauth/callback - Callback do Facebook
 * 3. GET /api/instagram/oauth/status/:campaignId - Verifica status
 * 4. POST /api/instagram/oauth/disconnect/:campaignId - Desconecta
 */

import { Router, Request, Response } from 'express';
import { getInstagramOAuthService } from '../services/instagram-oauth.service';

const router = Router();

/**
 * GET /api/instagram/oauth/authorize
 * Inicia o fluxo OAuth - redireciona para Facebook Login
 */
router.get('/authorize', (req: Request, res: Response): void => {
  try {
    const { campaignId } = req.query;

    if (!campaignId || typeof campaignId !== 'string') {
      res.status(400).json({ error: 'campaignId é obrigatório' });
      return;
    }

    const oauthService = getInstagramOAuthService();
    const authUrl = oauthService.generateAuthorizationUrl(campaignId);

    console.log(`[Instagram OAuth] Iniciando autorização para campanha ${campaignId}`);

    // Redirecionar para Facebook Login
    res.redirect(authUrl);
  } catch (error: any) {
    console.error('[Instagram OAuth] Erro ao iniciar autorização:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/instagram/oauth/callback
 * Callback do Facebook após autorização
 */
router.get('/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, error, error_description } = req.query;

    // Verificar se usuário negou autorização
    if (error) {
      console.error('[Instagram OAuth] Usuário negou autorização:', error_description);
      res.redirect(`/aic-campaign-onboarding.html?instagram_error=${encodeURIComponent(error_description as string || 'Autorização negada')}`);
      return;
    }

    if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
      res.status(400).json({ error: 'Parâmetros inválidos no callback' });
      return;
    }

    console.log('[Instagram OAuth] Callback recebido, processando...');

    const oauthService = getInstagramOAuthService();
    const result = await oauthService.processOAuthCallback(code, state);

    if (!result.success) {
      console.error('[Instagram OAuth] Erro no callback:', result.error);
      res.redirect(`/aic-campaign-onboarding.html?instagram_error=${encodeURIComponent(result.error || 'Erro desconhecido')}`);
      return;
    }

    console.log(`[Instagram OAuth] Conta @${result.account?.username} conectada com sucesso`);

    // Extrair campaignId do state para redirecionar corretamente
    const stateData = oauthService.parseState(state);
    const campaignId = stateData?.campaignId || '';

    // Redirecionar de volta para o onboarding com sucesso
    res.redirect(`/aic-campaign-onboarding.html?campaign=${campaignId}&instagram_connected=true&instagram_username=${encodeURIComponent(result.account?.username || '')}`);

  } catch (error: any) {
    console.error('[Instagram OAuth] Erro no callback:', error);
    res.redirect(`/aic-campaign-onboarding.html?instagram_error=${encodeURIComponent('Erro interno ao processar autorização')}`);
  }
});

/**
 * GET /api/instagram/oauth/status/:campaignId
 * Verifica status da conexão Instagram
 */
router.get('/status/:campaignId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;

    if (!campaignId) {
      res.status(400).json({ error: 'campaignId é obrigatório' });
      return;
    }

    const oauthService = getInstagramOAuthService();
    const status = await oauthService.checkAccountStatus(campaignId);

    res.json(status);

  } catch (error: any) {
    console.error('[Instagram OAuth] Erro ao verificar status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/instagram/oauth/disconnect/:campaignId
 * Desconecta conta Instagram
 */
router.post('/disconnect/:campaignId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaignId } = req.params;

    if (!campaignId) {
      res.status(400).json({ error: 'campaignId é obrigatório' });
      return;
    }

    const oauthService = getInstagramOAuthService();
    const result = await oauthService.disconnectAccount(campaignId);

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Conta Instagram desconectada' });

  } catch (error: any) {
    console.error('[Instagram OAuth] Erro ao desconectar:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/instagram/oauth/config
 * Retorna configuração pública do OAuth (para debug)
 */
router.get('/config', (req: Request, res: Response): void => {
  const appId = process.env.META_APP_ID;
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI;

  res.json({
    configured: !!(appId && redirectUri),
    appId: appId ? `${appId.substring(0, 4)}...` : null,
    redirectUri: redirectUri || null,
    scopes: [
      'instagram_basic',
      'instagram_manage_messages',
      'instagram_manage_comments',
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_metadata',
      'business_management'
    ]
  });
});

export default router;
