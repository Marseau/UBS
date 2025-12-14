/**
 * Campaign Web Tracking API
 *
 * Endpoints para tracking de sessões web, eventos (CTAs), e atribuição de leads
 * Usado pelas landing pages para enviar dados de analytics
 */

import express, { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// =====================================================
// CONFIGURAÇÃO
// =====================================================

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// =====================================================
// HELPER: Validar UUID
// =====================================================

function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// =====================================================
// POST /api/tracking/session
// Cria ou atualiza sessão web
// =====================================================

router.post('/session', async (req: Request, res: Response) => {
  try {
    const {
      session_id,
      campaign_id,
      source,
      medium,
      utm_campaign,
      utm_content,
      utm_term,
      landing_url,
      referrer,
      user_agent
    } = req.body;

    // Validação básica
    if (!campaign_id || !isValidUUID(campaign_id)) {
      return res.status(400).json({ error: 'campaign_id is required and must be a valid UUID' });
    }

    // Capturar IP (opcional, cuidado com LGPD)
    const ip_address = req.ip || req.connection.remoteAddress;

    // Se session_id não existe, criar nova sessão
    if (!session_id || !isValidUUID(session_id)) {
      const { data, error } = await supabase
        .from('campaign_web_sessions')
        .insert({
          campaign_id,
          source: source || 'direct',
          medium: medium || null,
          utm_campaign: utm_campaign || null,
          utm_content: utm_content || null,
          utm_term: utm_term || null,
          landing_url,
          referrer: referrer || null,
          user_agent: user_agent || req.headers['user-agent'],
          ip_address: ip_address || null,
          last_activity_at: new Date().toISOString()
        })
        .select('session_id')
        .single();

      if (error) {
        console.error('[Campaign Tracking] Error creating session:', error);
        return res.status(500).json({ error: 'Failed to create session' });
      }

      console.log(`[Campaign Tracking] ✅ Session created: ${data.session_id}`);
      return res.status(201).json({ session_id: data.session_id });
    }

    // Se session_id existe, atualizar last_activity_at
    const { error: updateError } = await supabase
      .from('campaign_web_sessions')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('session_id', session_id);

    if (updateError) {
      console.error('[Campaign Tracking] Error updating session:', updateError);
      return res.status(500).json({ error: 'Failed to update session' });
    }

    console.log(`[Campaign Tracking] ✅ Session updated: ${session_id}`);
    return res.status(200).json({ session_id });

  } catch (error) {
    console.error('[Campaign Tracking] Error in /session:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =====================================================
// POST /api/tracking/event
// Registra evento (CTA click, form submit, etc)
// =====================================================

router.post('/event', async (req: Request, res: Response) => {
  try {
    const {
      session_id,
      campaign_id,
      event_type,
      event_label,
      event_value,
      url,
      element_text,
      element_class,
      element_id
    } = req.body;

    // Validação
    if (!session_id || !isValidUUID(session_id)) {
      return res.status(400).json({ error: 'session_id is required and must be a valid UUID' });
    }

    if (!campaign_id || !isValidUUID(campaign_id)) {
      return res.status(400).json({ error: 'campaign_id is required and must be a valid UUID' });
    }

    if (!event_type) {
      return res.status(400).json({ error: 'event_type is required' });
    }

    // Inserir evento
    const { data, error } = await supabase
      .from('campaign_web_events')
      .insert({
        session_id,
        campaign_id,
        event_type,
        event_label: event_label || null,
        event_value: event_value || null,
        url: url || null,
        element_text: element_text || null,
        element_class: element_class || null,
        element_id: element_id || null
      })
      .select('event_id')
      .single();

    if (error) {
      console.error('[Campaign Tracking] Error creating event:', error);
      return res.status(500).json({ error: 'Failed to create event' });
    }

    // Atualizar last_activity_at da sessão
    await supabase
      .from('campaign_web_sessions')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('session_id', session_id);

    console.log(`[Campaign Tracking] ✅ Event created: ${event_type} (${event_label}) for session ${session_id}`);
    return res.status(201).json({ event_id: data.event_id });

  } catch (error) {
    console.error('[Campaign Tracking] Error in /event:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =====================================================
// POST /api/tracking/lead-attribution
// Atribui lead a uma sessão
// =====================================================

router.post('/lead-attribution', async (req: Request, res: Response) => {
  try {
    const {
      lead_id,
      session_id,
      campaign_id,
      contact_channel,
      lead_status,
      attribution_type,
      conversion_value
    } = req.body;

    // Validação
    if (!lead_id || !isValidUUID(lead_id)) {
      return res.status(400).json({ error: 'lead_id is required and must be a valid UUID' });
    }

    if (!campaign_id || !isValidUUID(campaign_id)) {
      return res.status(400).json({ error: 'campaign_id is required and must be a valid UUID' });
    }

    // session_id é opcional (lead pode vir de outros canais)
    const sessionIdValue = session_id && isValidUUID(session_id) ? session_id : null;

    // Inserir atribuição (UPSERT para evitar duplicatas)
    const { data, error } = await supabase
      .from('campaign_lead_attribution')
      .upsert({
        lead_id,
        session_id: sessionIdValue,
        campaign_id,
        contact_channel: contact_channel || 'unknown',
        lead_status: lead_status || 'pending',
        attribution_type: attribution_type || 'first_touch',
        conversion_value: conversion_value || null
      }, {
        onConflict: 'lead_id,session_id'
      })
      .select('id')
      .single();

    if (error) {
      console.error('[Campaign Tracking] Error creating lead attribution:', error);
      return res.status(500).json({ error: 'Failed to create lead attribution' });
    }

    console.log(`[Campaign Tracking] ✅ Lead attribution created: lead ${lead_id} → session ${sessionIdValue}`);
    return res.status(201).json({ id: data.id });

  } catch (error) {
    console.error('[Campaign Tracking] Error in /lead-attribution:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =====================================================
// GET /api/tracking/stats/:campaign_id
// Retorna estatísticas de uma campanha
// =====================================================

router.get('/stats/:campaign_id', async (req: Request, res: Response) => {
  try {
    const { campaign_id } = req.params;

    if (!campaign_id || !isValidUUID(campaign_id)) {
      return res.status(400).json({ error: 'Invalid campaign_id' });
    }

    // Buscar overview da campanha
    const { data: overview, error: overviewError } = await supabase
      .from('vw_campaign_overview')
      .select('*')
      .eq('campaign_id', campaign_id)
      .single();

    if (overviewError) {
      console.error('[Campaign Tracking] Error fetching overview:', overviewError);
      return res.status(500).json({ error: 'Failed to fetch campaign overview' });
    }

    // Buscar leads por fonte
    const { data: leadsBySource, error: sourceError } = await supabase
      .from('vw_leads_by_source')
      .select('*')
      .eq('campaign_id', campaign_id);

    if (sourceError) {
      console.error('[Campaign Tracking] Error fetching leads by source:', sourceError);
    }

    // Buscar performance de CTAs
    const { data: ctaPerformance, error: ctaError } = await supabase
      .from('vw_cta_performance')
      .select('*')
      .eq('campaign_id', campaign_id)
      .order('cta_clicks', { ascending: false });

    if (ctaError) {
      console.error('[Campaign Tracking] Error fetching CTA performance:', ctaError);
    }

    return res.status(200).json({
      overview: overview || {},
      leads_by_source: leadsBySource || [],
      cta_performance: ctaPerformance || []
    });

  } catch (error) {
    console.error('[Campaign Tracking] Error in /stats:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// =====================================================
// EXPORT
// =====================================================

export default router;
