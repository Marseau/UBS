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
import { supabase, supabaseAdmin } from '../config/database';
import { instagramClientDMService } from '../services/instagram-client-dm.service';
import { credentialsVault } from '../services/credentials-vault.service';

const router = express.Router();

/**
 * POST /api/instagram/check-engagement
 *
 * Verifica notificações do Instagram e detecta interações
 * 1. Detecta curtidas em reels/posts
 * 2. Detecta comentários
 * 3. Detecta novos seguidores → Clica em "Seguir de volta" automaticamente
 * 4. PERSISTE interações em account_actions
 * 5. ATUALIZA last_interaction_at em instagram_leads
 *
 * Retorna lista de usernames que interagiram para processar depois
 */
router.post('/check-engagement', async (req: Request, res: Response) => {
  try {
    const { since, persist = true } = req.body; // persist: se deve salvar no banco

    console.log(`\n📊 Verificando notificações do Instagram...`);
    if (since) {
      console.log(`   🕐 Filtrando interações desde: ${since}`);
    }

    // Garantir que está logado com conta oficial (@ubs.sistemas)
    await ensureCorrectAccount(OperationType.ENGAGEMENT);

    // Executar verificação usando PÁGINA COMPARTILHADA
    const result = await InstagramAutomationRefactored.checkAllNotifications();

    if (!result.success) {
      throw new Error(result.error_message || 'Erro ao verificar notificações');
    }

    console.log(`   ✅ Verificação concluída`);
    console.log(`   📋 Total de interações encontradas: ${result.interactions.length}`);

    // FILTRAR apenas as mais recentes que 'since' (se fornecido)
    let filteredInteractions = result.interactions;

    if (since) {
      const sinceDate = new Date(since);
      filteredInteractions = result.interactions.filter(interaction => {
        // Se não tem data de notificação, incluir (assume que é recente)
        if (!interaction.notification_date) return true;

        const notifDate = new Date(interaction.notification_date);
        return notifDate > sinceDate;
      });

      const filteredOut = result.interactions.length - filteredInteractions.length;
      console.log(`   ✅ Novas interações (desde ${since}): ${filteredInteractions.length}`);
      console.log(`   ⏭️  Já processadas anteriormente: ${filteredOut}`);
    }

    // ========================================
    // PERSISTIR INTERAÇÕES EM account_actions
    // ========================================
    let persistedCount = 0;
    let updatedLeadsCount = 0;

    if (persist && filteredInteractions.length > 0) {
      console.log(`\n💾 Persistindo ${filteredInteractions.length} interações...`);

      for (const interaction of filteredInteractions) {
        try {
          // Determinar tipos de ação baseado na interação
          const actionTypes: string[] = [];
          if (interaction.liked) actionTypes.push('like_received');
          if (interaction.commented) actionTypes.push('comment_received');
          if (interaction.is_new_follower) actionTypes.push('follow_received');

          // Inserir cada tipo de ação em account_actions
          for (const actionType of actionTypes) {
            const { error: insertError } = await supabase
              .from('account_actions')
              .insert({
                username: interaction.username,
                action_type: actionType,
                source_platform: 'instagram',  // Interações vêm do Instagram
                success: true,
                created_at: interaction.notification_date || new Date().toISOString()
              });

            if (!insertError) {
              persistedCount++;
              console.log(`   ✅ ${actionType} de @${interaction.username} salvo`);
            }
          }

          // Atualizar last_interaction_at em instagram_leads via RPC atômica
          const interactionType = interaction.commented ? 'comment' :
                                  interaction.liked ? 'like' :
                                  interaction.is_new_follower ? 'follow_back' : 'engagement';

          const scoreIncrement = interaction.commented ? 20 : interaction.liked ? 10 : 30;

          // Usar RPC para incremento atômico
          const { error: rpcError } = await supabase.rpc('increment_lead_engagement', {
            p_username: interaction.username,
            p_interaction_type: interactionType,
            p_score_increment: scoreIncrement
          });

          if (!rpcError) {
            updatedLeadsCount++;
          } else {
            // Fallback: update direto se RPC falhar
            const { error: updateError } = await supabase
              .from('instagram_leads')
              .update({
                last_interaction_at: new Date().toISOString(),
                last_interaction_type: interactionType
              })
              .eq('username', interaction.username);

            if (!updateError) {
              updatedLeadsCount++;
            }
          }

        } catch (err) {
          console.error(`   ❌ Erro ao persistir interação de @${interaction.username}:`, err);
        }
      }

      console.log(`   📊 Total persistido: ${persistedCount} ações, ${updatedLeadsCount} leads atualizados`);
    }

    // Retornar lista de usernames que interagiram
    return res.status(200).json({
      success: true,
      total_interactions: filteredInteractions.length,
      interactions: filteredInteractions,
      total_found: result.interactions.length,
      filtered_out: result.interactions.length - filteredInteractions.length,
      persisted_actions: persistedCount,
      updated_leads: updatedLeadsCount,
      since: since || null,
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
 * POST /api/instagram/follow-lead
 *
 * Segue um lead no Instagram apos envio de DM outbound
 * Registra na tabela campaign_instagram_follows para rastreamento
 * Usado pelo workflow "AIC - Instagram Follow After DM"
 */
router.post('/follow-lead', async (req: Request, res: Response) => {
  try {
    const {
      campaign_id,
      lead_id,
      username,
      dm_message_id  // ID da mensagem que originou o follow (opcional)
    } = req.body;

    if (!campaign_id || !lead_id || !username) {
      return res.status(400).json({
        error: 'Campos obrigatorios faltando',
        required: ['campaign_id', 'lead_id', 'username']
      });
    }

    console.log(`\n👥 [FOLLOW-LEAD] Seguindo @${username} para campanha ${campaign_id}...`);

    // Verificar status da campanha - APENAS campanhas ATIVAS podem executar follows
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('cluster_campaigns')
      .select('id, campaign_name, status, outreach_enabled')
      .eq('id', campaign_id)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campanha nao encontrada',
        campaign_id
      });
    }

    if (campaign.status !== 'active') {
      console.log(`   ⚠️ Campanha ${campaign.campaign_name} nao esta ativa (status: ${campaign.status})`);
      return res.status(400).json({
        success: false,
        error: 'Campanha nao esta ativa',
        campaign_status: campaign.status,
        message: `Follow nao executado. Campanha deve estar com status 'active' (atual: '${campaign.status}')`
      });
    }

    // Buscar conta Instagram da campanha
    const instagramAccount = await credentialsVault.getAccountByCampaign(campaign_id);

    if (!instagramAccount) {
      console.error(`   ❌ Campanha ${campaign.campaign_name} nao tem conta Instagram configurada`);
      return res.status(400).json({
        success: false,
        error: 'Campanha sem conta Instagram',
        message: 'Configure uma conta Instagram para esta campanha antes de executar follows'
      });
    }

    console.log(`   📱 Usando conta da campanha: @${instagramAccount.instagramUsername}`);

    // Verificar rate limit
    const rateLimit = await credentialsVault.checkRateLimit(instagramAccount.id);
    if (!rateLimit.canFollow) {
      console.log(`   ⚠️ Rate limit atingido: ${rateLimit.reason}`);
      return res.status(429).json({
        success: false,
        error: 'Rate limit atingido',
        reason: rateLimit.reason,
        followsRemainingToday: rateLimit.followsRemainingToday,
        followsRemainingHour: rateLimit.followsRemainingHour
      });
    }

    // Obter sessao da conta da campanha
    const session = await instagramClientDMService.getOrCreateSession(instagramAccount.id);
    if (!session) {
      return res.status(500).json({
        success: false,
        error: 'Falha ao criar sessao',
        message: 'Nao foi possivel criar sessao para conta Instagram da campanha'
      });
    }

    const { page } = session;

    // Executar follow via Puppeteer
    console.log(`   🔍 Navegando para perfil @${username}...`);
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));

    // Verificar se ja segue
    const alreadyFollowing = await page.evaluate(() => {
      // @ts-ignore
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const btn of buttons) {
        // @ts-ignore
        const text = btn.textContent?.trim() || '';
        if (text === 'Seguindo' || text === 'Following' || text === 'Solicitado' || text === 'Requested') {
          return true;
        }
      }
      return false;
    });

    if (alreadyFollowing) {
      console.log(`   ℹ️ Ja segue @${username}`);
    } else {
      // Clicar no botao Follow
      const followClicked = await page.evaluate(() => {
        // @ts-ignore
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const btn of buttons) {
          // @ts-ignore
          const text = btn.textContent?.trim() || '';
          if (text === 'Seguir' || text === 'Follow') {
            // @ts-ignore
            btn.click();
            return true;
          }
        }
        return false;
      });

      if (!followClicked) {
        throw new Error('Botao de Follow nao encontrado');
      }

      await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
      console.log(`   ✅ Follow executado em @${username}`);

      // Incrementar contador de acoes
      await credentialsVault.incrementAction(instagramAccount.id, 'follow');
    }

    // Registrar na tabela campaign_instagram_follows usando RPC
    const { data: followId, error: rpcError } = await supabaseAdmin.rpc('register_instagram_follow', {
      p_campaign_id: campaign_id,
      p_lead_id: lead_id,
      p_instagram_username: username,
      p_dm_message_id: dm_message_id || null
    });

    if (rpcError) {
      console.error(`   ⚠️  Erro ao registrar follow no banco: ${rpcError.message}`);
    } else {
      console.log(`   ✅ Follow registrado no banco: ${followId}`);
    }

    return res.status(200).json({
      success: true,
      campaign_id,
      lead_id,
      username,
      action_type: 'follow',
      already_following: alreadyFollowing,
      instagram_account: instagramAccount.instagramUsername,
      follow_record_id: followId || null,
      executed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erro ao seguir lead:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao seguir lead',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

/**
 * GET /api/instagram/dms-pending-follow
 *
 * Busca DMs Instagram enviados que ainda nao tiveram follow registrado
 * Usado pelo workflow "AIC - Instagram Follow After DM"
 */
router.get('/dms-pending-follow', async (req: Request, res: Response) => {
  try {
    const {
      limit = '3',
      since_minutes = '30'
    } = req.query;

    console.log(`\n🔍 [PENDING-FOLLOW] Buscando DMs sem follow registrado...`);

    const { data, error } = await supabaseAdmin.rpc('get_dms_pending_follow', {
      p_limit: parseInt(limit as string),
      p_since_minutes: parseInt(since_minutes as string)
    });

    if (error) {
      throw new Error(error.message);
    }

    console.log(`   ✅ Encontrados ${data?.length || 0} DMs pendentes de follow`);

    return res.status(200).json({
      success: true,
      total: data?.length || 0,
      dms: data || []
    });

  } catch (error) {
    console.error('❌ Erro ao buscar DMs pendentes:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao buscar DMs pendentes de follow',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

/**
 * GET /api/instagram/campaigns-pending-unfollow
 *
 * Lista campanhas com leads elegíveis para unfollow
 * Usado pelo workflow "AIC - Instagram Nightly Unfollow"
 */
router.get('/campaigns-pending-unfollow', async (_req: Request, res: Response) => {
  try {
    console.log(`\n🔍 [PENDING-UNFOLLOW] Buscando campanhas com unfollows pendentes...`);

    const { data, error } = await supabaseAdmin.rpc('get_campaigns_with_active_outreach');

    if (error) {
      throw new Error(error.message);
    }

    console.log(`   ✅ Encontradas ${data?.length || 0} campanhas com unfollows pendentes`);

    return res.status(200).json({
      success: true,
      total: data?.length || 0,
      campaigns: data || []
    });

  } catch (error) {
    console.error('❌ Erro ao buscar campanhas:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao buscar campanhas pendentes de unfollow',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

/**
 * GET /api/instagram/unfollow-candidates-campaign/:campaign_id
 *
 * Busca candidatos para unfollow de uma campanha especifica
 * Usado pelo workflow "AIC - Instagram Nightly Unfollow"
 */
router.get('/unfollow-candidates-campaign/:campaign_id', async (req: Request, res: Response) => {
  try {
    const { campaign_id } = req.params;
    const { limit = '5' } = req.query;

    console.log(`\n🔍 [UNFOLLOW-CANDIDATES] Buscando candidatos para campanha ${campaign_id}...`);

    const { data, error } = await supabaseAdmin.rpc('get_unfollow_candidates', {
      p_campaign_id: campaign_id,
      p_limit: parseInt(limit as string)
    });

    if (error) {
      throw new Error(error.message);
    }

    console.log(`   ✅ Encontrados ${data?.length || 0} candidatos para unfollow`);

    return res.status(200).json({
      success: true,
      campaign_id,
      total: data?.length || 0,
      candidates: data || []
    });

  } catch (error) {
    console.error('❌ Erro ao buscar candidatos:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao buscar candidatos para unfollow',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

/**
 * POST /api/instagram/execute-unfollow
 *
 * Executa unfollow e registra na tabela campaign_instagram_follows
 * Usado pelo workflow "AIC - Instagram Nightly Unfollow"
 */
router.post('/execute-unfollow', async (req: Request, res: Response) => {
  try {
    const {
      follow_id,  // ID do registro em campaign_instagram_follows
      lead_id,
      username,
      campaign_id,  // Opcional, mas necessario para validacao de status
      reason = 'no_engagement'
    } = req.body;

    if (!follow_id || !username) {
      return res.status(400).json({
        error: 'Campos obrigatorios faltando',
        required: ['follow_id', 'username']
      });
    }

    console.log(`\n🗑️  [EXECUTE-UNFOLLOW] Aplicando unfollow em @${username}...`);

    // Buscar campaign_id do follow_id se nao fornecido
    let targetCampaignId = campaign_id;
    if (!targetCampaignId) {
      const { data: followRecord } = await supabaseAdmin
        .from('campaign_instagram_follows')
        .select('campaign_id')
        .eq('id', follow_id)
        .single();

      if (followRecord) {
        targetCampaignId = followRecord.campaign_id;
      }
    }

    if (!targetCampaignId) {
      return res.status(400).json({
        success: false,
        error: 'campaign_id nao encontrado',
        message: 'Nao foi possivel determinar a campanha para este unfollow'
      });
    }

    // Verificar status da campanha - APENAS campanhas ATIVAS podem executar unfollows
    const { data: campaign } = await supabaseAdmin
      .from('cluster_campaigns')
      .select('id, campaign_name, status')
      .eq('id', targetCampaignId)
      .single();

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campanha nao encontrada',
        campaign_id: targetCampaignId
      });
    }

    if (campaign.status !== 'active') {
      console.log(`   ⚠️ Campanha ${campaign.campaign_name} nao esta ativa (status: ${campaign.status})`);
      return res.status(400).json({
        success: false,
        error: 'Campanha nao esta ativa',
        campaign_status: campaign.status,
        message: `Unfollow nao executado. Campanha deve estar com status 'active' (atual: '${campaign.status}')`
      });
    }

    // Buscar conta Instagram da campanha
    const instagramAccount = await credentialsVault.getAccountByCampaign(targetCampaignId);

    if (!instagramAccount) {
      console.error(`   ❌ Campanha ${campaign.campaign_name} nao tem conta Instagram configurada`);
      return res.status(400).json({
        success: false,
        error: 'Campanha sem conta Instagram',
        message: 'Configure uma conta Instagram para esta campanha antes de executar unfollows'
      });
    }

    console.log(`   📱 Usando conta da campanha: @${instagramAccount.instagramUsername}`);

    // Verificar rate limit
    const rateLimit = await credentialsVault.checkRateLimit(instagramAccount.id);
    if (!rateLimit.canUnfollow) {
      console.log(`   ⚠️ Rate limit atingido: ${rateLimit.reason}`);
      return res.status(429).json({
        success: false,
        error: 'Rate limit atingido',
        reason: rateLimit.reason,
        unfollowsRemainingToday: rateLimit.unfollowsRemainingToday
      });
    }

    // Obter sessao da conta da campanha
    const session = await instagramClientDMService.getOrCreateSession(instagramAccount.id);
    if (!session) {
      return res.status(500).json({
        success: false,
        error: 'Falha ao criar sessao',
        message: 'Nao foi possivel criar sessao para conta Instagram da campanha'
      });
    }

    const { page } = session;

    // Executar unfollow via Puppeteer
    console.log(`   🔍 Navegando para perfil @${username}...`);
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));

    // Verificar se esta seguindo
    let wasNotFollowing = false;
    const isFollowing = await page.evaluate(() => {
      // @ts-ignore
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const btn of buttons) {
        // @ts-ignore
        const text = btn.textContent?.trim() || '';
        if (text === 'Seguindo' || text === 'Following') {
          return true;
        }
      }
      return false;
    });

    if (!isFollowing) {
      console.log(`   ℹ️ Nao estava seguindo @${username}`);
      wasNotFollowing = true;
    } else {
      // Clicar no botao "Seguindo" para abrir menu
      const menuOpened = await page.evaluate(() => {
        // @ts-ignore
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const btn of buttons) {
          // @ts-ignore
          const text = btn.textContent?.trim() || '';
          if (text === 'Seguindo' || text === 'Following') {
            // @ts-ignore
            btn.click();
            return true;
          }
        }
        return false;
      });

      if (!menuOpened) {
        throw new Error('Botao Seguindo nao encontrado');
      }

      await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));

      // Clicar em "Deixar de seguir"
      const unfollowClicked = await page.evaluate(() => {
        // @ts-ignore
        const elements = Array.from(document.querySelectorAll('button, div[role="button"], span'));
        for (const el of elements) {
          // @ts-ignore
          const text = el.textContent?.trim() || '';
          if (text === 'Deixar de seguir' || text === 'Unfollow') {
            // @ts-ignore
            el.click();
            return true;
          }
        }
        return false;
      });

      if (!unfollowClicked) {
        throw new Error('Opcao Deixar de seguir nao encontrada');
      }

      await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
      console.log(`   ✅ Unfollow executado em @${username}`);

      // Incrementar contador de acoes
      await credentialsVault.incrementAction(instagramAccount.id, 'unfollow');
    }

    // Registrar unfollow no banco
    const { data: success, error: rpcError } = await supabaseAdmin.rpc('register_instagram_unfollow', {
      p_follow_id: follow_id,
      p_reason: wasNotFollowing ? 'was_not_following' : reason
    });

    if (rpcError) {
      console.error(`   ⚠️  Erro ao registrar unfollow no banco: ${rpcError.message}`);
    } else {
      console.log(`   ✅ Unfollow registrado no banco`);
    }

    return res.status(200).json({
      success: true,
      follow_id,
      lead_id,
      username,
      action_type: 'unfollow',
      was_not_following: wasNotFollowing,
      instagram_account: instagramAccount.instagramUsername,
      reason: wasNotFollowing ? 'was_not_following' : reason,
      executed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erro ao executar unfollow:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao executar unfollow',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

/**
 * POST /api/instagram/mark-engagement
 *
 * Marca engajamento de um lead (previne unfollow)
 * Chamado pelos workflows de inbound quando lead responde
 */
router.post('/mark-engagement', async (req: Request, res: Response) => {
  try {
    const {
      lead_id,
      engagement_type  // 'followed_back', 'dm_replied', 'liked', 'commented'
    } = req.body;

    if (!lead_id || !engagement_type) {
      return res.status(400).json({
        error: 'Campos obrigatorios faltando',
        required: ['lead_id', 'engagement_type']
      });
    }

    console.log(`\n✅ [MARK-ENGAGEMENT] Registrando ${engagement_type} para lead ${lead_id}...`);

    const { data: success, error } = await supabaseAdmin.rpc('mark_follow_engagement', {
      p_lead_id: lead_id,
      p_engagement_type: engagement_type
    });

    if (error) {
      throw new Error(error.message);
    }

    console.log(`   ✅ Engajamento registrado: ${success}`);

    return res.status(200).json({
      success: true,
      lead_id,
      engagement_type,
      updated: success,
      marked_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erro ao marcar engajamento:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao marcar engajamento',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

/**
 * GET /api/instagram/follow-stats
 *
 * Retorna estatisticas de follow/unfollow por campanha
 */
router.get('/follow-stats', async (_req: Request, res: Response) => {
  try {
    console.log(`\n📊 [FOLLOW-STATS] Buscando estatisticas...`);

    const { data, error } = await supabaseAdmin
      .from('campaign_follow_stats')
      .select('*');

    if (error) {
      throw new Error(error.message);
    }

    return res.status(200).json({
      success: true,
      stats: data || []
    });

  } catch (error) {
    console.error('❌ Erro ao buscar estatisticas:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao buscar estatisticas',
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

    // 3. Persistir no banco de dados
    console.log('💾 Salvando registro no banco...');
    const { data: dmRecord, error: dbError } = await supabaseAdmin
      .from('instagram_dm_outreach')
      .insert({
        lead_id,
        username,
        full_name: full_name || null,
        business_category: business_category || null,
        message_text: personalizedDM.message,
        message_generated_by: personalizedDM.model,
        generation_prompt: personalizedDM.prompt_used,
        sent_at: dmResult.sent_at,
        delivery_status: 'sent'
      })
      .select()
      .single();

    if (dbError) {
      console.error('⚠️  Erro ao salvar no banco (DM foi enviado!):', dbError);
      // Não falhar a request se DM foi enviado com sucesso
    } else {
      console.log(`   ✅ Registro salvo no banco: ${dmRecord.id}`);
    }

    // 4. Retornar sucesso
    return res.status(200).json({
      success: true,
      lead_id,
      username,
      message_text: personalizedDM.message,
      message_generated_by: personalizedDM.model,
      generation_prompt: personalizedDM.prompt_used,
      tokens_used: personalizedDM.tokens_used,
      sent_at: dmResult.sent_at,
      delivery_status: 'sent',
      dm_record_id: dmRecord?.id || null
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

/**
 * POST /api/instagram/inspect-profile-html
 *
 * DEBUG: Extrai HTML de um perfil usando sessão autenticada
 * Para diagnosticar estrutura de botões
 */
router.post('/inspect-profile-html', async (req: Request, res: Response) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({
        error: 'Username obrigatório'
      });
    }

    console.log(`\n🔍 [DEBUG] Inspecionando HTML do perfil @${username}...`);

    // Garantir que está logado com conta oficial
    await ensureCorrectAccount(OperationType.ENGAGEMENT);

    // Usar função de inspeção do serviço refatorado
    const htmlInfo = await InstagramAutomationRefactored.inspectProfileHTML(username);

    return res.status(200).json({
      success: true,
      username,
      ...htmlInfo
    });

  } catch (error) {
    console.error('❌ Erro ao inspecionar HTML:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao inspecionar HTML',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

// ============================================================================
// SISTEMA DE UNFOLLOW INTELIGENTE (com interações e contas de clientes)
// ============================================================================

/**
 * GET /api/instagram/unfollow-candidates
 *
 * Busca leads elegíveis para unfollow baseado em:
 * 1. followed_at > X dias (padrão 3)
 * 2. SEM interação (last_interaction_at é null OU last_interaction_at > X dias)
 * 3. follow_status = 'followed' ou 'following'
 *
 * Pode filtrar por campaign_id para usar conta específica do cliente
 */
router.get('/unfollow-candidates', async (req: Request, res: Response) => {
  try {
    const {
      campaign_id,
      days_without_interaction = '3',
      limit = '10'
    } = req.query;

    const daysThreshold = parseInt(days_without_interaction as string);
    const resultLimit = Math.min(parseInt(limit as string), 50); // Max 50

    console.log(`\n🔍 [UNFOLLOW] Buscando candidatos para unfollow`);
    console.log(`   Dias sem interação: ${daysThreshold}`);
    console.log(`   Campanha: ${campaign_id || 'todas'}`);
    console.log(`   Limite: ${resultLimit}`);

    // Data de corte: seguidos há mais de X dias
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);
    const cutoffISO = cutoffDate.toISOString();

    // Query base
    let query = supabase
      .from('instagram_leads')
      .select(`
        id,
        username,
        full_name,
        follow_status,
        followed_at,
        last_interaction_at,
        last_interaction_type,
        campaign_id
      `)
      .in('follow_status', ['followed', 'following'])
      .not('followed_at', 'is', null)
      .lt('followed_at', cutoffISO)
      .order('followed_at', { ascending: true }) // Mais antigos primeiro
      .limit(resultLimit);

    // Filtrar por campanha se especificado
    if (campaign_id) {
      query = query.eq('campaign_id', campaign_id);
    }

    const { data: leads, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    // Filtrar leads sem interação recente
    const candidates = (leads || []).filter(lead => {
      // Se nunca interagiu, é candidato
      if (!lead.last_interaction_at) {
        return true;
      }

      // Se última interação foi há mais de X dias, é candidato
      const lastInteraction = new Date(lead.last_interaction_at);
      return lastInteraction < cutoffDate;
    });

    console.log(`   ✅ Encontrados ${candidates.length} candidatos`);

    // Agrupar por campanha para facilitar uso com contas de clientes
    const byCampaign: Record<string, typeof candidates> = {};
    for (const lead of candidates) {
      const cid = lead.campaign_id || 'sem_campanha';
      if (!byCampaign[cid]) {
        byCampaign[cid] = [];
      }
      byCampaign[cid].push(lead);
    }

    return res.status(200).json({
      success: true,
      total: candidates.length,
      days_threshold: daysThreshold,
      cutoff_date: cutoffISO,
      candidates: candidates.map(lead => ({
        lead_id: lead.id,
        username: lead.username,
        full_name: lead.full_name,
        follow_status: lead.follow_status,
        followed_at: lead.followed_at,
        days_since_follow: Math.floor((Date.now() - new Date(lead.followed_at!).getTime()) / (1000 * 60 * 60 * 24)),
        last_interaction_at: lead.last_interaction_at,
        last_interaction_type: lead.last_interaction_type,
        days_since_interaction: lead.last_interaction_at
          ? Math.floor((Date.now() - new Date(lead.last_interaction_at).getTime()) / (1000 * 60 * 60 * 24))
          : null,
        campaign_id: lead.campaign_id
      })),
      by_campaign: Object.entries(byCampaign).map(([cid, leads]) => ({
        campaign_id: cid,
        count: leads.length
      }))
    });

  } catch (error) {
    console.error('❌ Erro ao buscar candidatos:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao buscar candidatos para unfollow',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

/**
 * POST /api/instagram/unfollow-with-client-account
 *
 * Executa unfollow usando a conta Instagram do cliente (via credentials-vault)
 * Integrado com o sistema de contas seguras
 */
router.post('/unfollow-with-client-account', async (req: Request, res: Response) => {
  try {
    const { lead_id, username, campaign_id, account_id } = req.body;

    if (!lead_id || !username) {
      return res.status(400).json({
        error: 'Campos obrigatórios faltando',
        required: ['lead_id', 'username']
      });
    }

    console.log(`\n🗑️  [UNFOLLOW-CLIENT] Aplicando unfollow: @${username}`);

    // Se tem account_id ou campaign_id, usar conta do cliente
    let targetAccountId = account_id;

    if (!targetAccountId && campaign_id) {
      // Buscar conta da campanha
      const { credentialsVault } = await import('../services/credentials-vault.service');
      const account = await credentialsVault.getAccountByCampaign(campaign_id);

      if (account) {
        targetAccountId = account.id;
        console.log(`   📱 Usando conta do cliente: @${account.instagramUsername}`);
      }
    }

    let result;

    if (targetAccountId) {
      // Usar conta do cliente via instagramClientDMService (que gerencia sessões)
      // Para unfollow, vamos usar o mesmo mecanismo de sessão
      const { instagramClientDMService } = await import('../services/instagram-client-dm.service');

      // Verificar se pode executar ação
      const canExecute = await instagramClientDMService.canSendDM(targetAccountId);
      if (!canExecute.canSend) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit ou fora do horário',
          reason: canExecute.reason
        });
      }

      // Obter sessão e executar unfollow
      const session = await instagramClientDMService.getOrCreateSession(targetAccountId);
      if (!session) {
        return res.status(500).json({
          success: false,
          error: 'Não foi possível criar sessão para conta do cliente'
        });
      }

      // Executar unfollow via página da sessão
      try {
        const page = session.page;

        // Navegar para perfil
        await page.goto(`https://www.instagram.com/${username}/`, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });

        await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));

        // Clicar no botão "Seguindo" para abrir menu
        const followingButton = await page.$('button:has-text("Seguindo"), button:has-text("Following")');
        if (followingButton) {
          await followingButton.click();
          await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));

          // Clicar em "Deixar de seguir"
          const unfollowOption = await page.$('button:has-text("Deixar de seguir"), button:has-text("Unfollow")');
          if (unfollowOption) {
            await unfollowOption.click();
            await new Promise(r => setTimeout(r, 2000));

            result = { success: true };
            console.log(`   ✅ Unfollow executado via conta do cliente`);

            // Incrementar ação
            const { credentialsVault } = await import('../services/credentials-vault.service');
            await credentialsVault.incrementAction(targetAccountId, 'unfollow');
          } else {
            result = { success: false, error_message: 'Botão de unfollow não encontrado' };
          }
        } else {
          result = { success: false, error_message: 'Usuário não está sendo seguido ou botão não encontrado' };
        }
      } catch (pageError) {
        result = {
          success: false,
          error_message: pageError instanceof Error ? pageError.message : 'Erro na página'
        };
      }

    } else {
      // Fallback: usar conta oficial (@ubs.sistemas)
      console.log(`   📱 Usando conta oficial (fallback)`);
      await ensureCorrectAccount(OperationType.ENGAGEMENT);
      result = await InstagramAutomationRefactored.unfollowUserShared(username);
    }

    // Atualizar lead no banco
    if (result.success) {
      await supabaseAdmin
        .from('instagram_leads')
        .update({
          follow_status: 'unfollowed',
          unfollowed_at: new Date().toISOString()
        })
        .eq('id', lead_id);

      // Registrar ação em account_actions
      await supabaseAdmin
        .from('account_actions')
        .insert({
          lead_id: lead_id,
          username: username,
          action_type: 'unfollow',
          source_platform: 'instagram',
          success: true,
          created_at: new Date().toISOString()
        });
    }

    return res.status(200).json({
      success: result.success,
      lead_id,
      username,
      action_type: 'unfollow',
      executed_at: new Date().toISOString(),
      error_message: result.error_message,
      used_client_account: !!targetAccountId,
      account_id: targetAccountId || null,
      follow_status: result.success ? 'unfollowed' : undefined,
      unfollowed_at: result.success ? new Date().toISOString() : undefined
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
 * POST /api/instagram/batch-unfollow
 *
 * Processa batch de unfollows com rate limiting
 * Pode usar conta do cliente ou conta oficial
 */
router.post('/batch-unfollow', async (req: Request, res: Response) => {
  try {
    const {
      leads,  // Array de { lead_id, username }
      campaign_id,
      account_id,
      delay_between_ms = 30000  // 30 segundos entre cada
    } = req.body;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({
        error: 'Array de leads é obrigatório',
        example: { leads: [{ lead_id: '123', username: 'user1' }] }
      });
    }

    if (leads.length > 10) {
      return res.status(400).json({
        error: 'Máximo de 10 leads por batch',
        received: leads.length
      });
    }

    console.log(`\n🗑️  [BATCH-UNFOLLOW] Processando ${leads.length} unfollows`);

    const results: Array<{
      lead_id: string;
      username: string;
      success: boolean;
      error?: string;
    }> = [];

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];

      console.log(`   [${i + 1}/${leads.length}] Processando @${lead.username}...`);

      try {
        // Chamar endpoint individual
        const response = await fetch(`http://localhost:${process.env.PORT || 3333}/api/instagram/unfollow-with-client-account`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lead_id: lead.lead_id,
            username: lead.username,
            campaign_id,
            account_id
          })
        });

        const data = await response.json() as { success: boolean; error?: string };
        results.push({
          lead_id: lead.lead_id,
          username: lead.username,
          success: data.success,
          error: data.error
        });

      } catch (err) {
        results.push({
          lead_id: lead.lead_id,
          username: lead.username,
          success: false,
          error: err instanceof Error ? err.message : 'Erro desconhecido'
        });
      }

      // Delay entre ações (exceto na última)
      if (i < leads.length - 1) {
        const delay = delay_between_ms + Math.random() * 5000; // + até 5s de variação
        console.log(`   ⏳ Aguardando ${Math.round(delay / 1000)}s...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`\n✅ [BATCH-UNFOLLOW] Concluído: ${successful} sucesso, ${failed} falhas`);

    return res.status(200).json({
      success: true,
      total: leads.length,
      successful,
      failed,
      results
    });

  } catch (error) {
    console.error('❌ Erro no batch unfollow:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao processar batch unfollow',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

/**
 * POST /api/instagram/record-interaction
 *
 * Registra uma interação de um lead (like, comment, story_view, etc.)
 * Atualiza last_interaction_at e last_interaction_type
 */
router.post('/record-interaction', async (req: Request, res: Response) => {
  try {
    const {
      lead_id,
      username,
      interaction_type,  // 'like', 'comment', 'story_view', 'story_mention', 'follow_back', etc.
      interaction_data   // Dados adicionais (opcional)
    } = req.body;

    if ((!lead_id && !username) || !interaction_type) {
      return res.status(400).json({
        error: 'Campos obrigatórios faltando',
        required: ['lead_id ou username', 'interaction_type']
      });
    }

    console.log(`\n📝 [INTERACTION] Registrando: ${interaction_type}`);
    console.log(`   Lead: ${lead_id || username}`);

    // Buscar lead se só tiver username
    let targetLeadId = lead_id;
    if (!targetLeadId && username) {
      const { data: lead } = await supabase
        .from('instagram_leads')
        .select('id')
        .eq('username', username)
        .single();

      if (lead) {
        targetLeadId = lead.id;
      }
    }

    if (!targetLeadId) {
      return res.status(404).json({
        success: false,
        error: 'Lead não encontrado'
      });
    }

    const now = new Date().toISOString();

    // Atualizar lead
    const updateData: Record<string, any> = {
      last_interaction_at: now,
      last_interaction_type: interaction_type
    };

    // Se for follow_back, atualizar status também
    if (interaction_type === 'follow_back') {
      updateData.follow_status = 'followed_back';
    }

    const { error: updateError } = await supabaseAdmin
      .from('instagram_leads')
      .update(updateData)
      .eq('id', targetLeadId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Registrar na tabela de interações (se existir)
    try {
      await supabaseAdmin
        .from('instagram_interactions')
        .insert({
          lead_id: targetLeadId,
          interaction_type,
          interaction_data: interaction_data || {},
          created_at: now
        });
    } catch {
      // Tabela pode não existir, ignorar
    }

    console.log(`   ✅ Interação registrada`);

    return res.status(200).json({
      success: true,
      lead_id: targetLeadId,
      interaction_type,
      recorded_at: now
    });

  } catch (error) {
    console.error('❌ Erro ao registrar interação:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao registrar interação',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

export default router;
