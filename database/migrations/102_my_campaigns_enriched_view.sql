-- ============================================================================
-- Migration 102: VIEW v_my_campaigns_enriched
-- Purpose: Optimize /api/aic/my-campaigns to eliminate N+1 queries
-- Before: 4 queries per campaign (10 campaigns = 40 queries = 3-5s latency)
-- After: 1 query total (latency: ~500ms)
-- ============================================================================

-- Drop existing view if exists (for idempotency)
DROP VIEW IF EXISTS v_my_campaigns_enriched;

-- Create optimized view that pre-aggregates all metrics
CREATE VIEW v_my_campaigns_enriched AS
SELECT
  c.id,
  c.campaign_name,
  c.project_id,
  c.status,
  c.pipeline_status,
  c.onboarding_status,
  c.nicho_principal,
  c.outreach_enabled,
  c.created_at,
  c.updated_at,
  c.client_email AS campaign_client_email,

  -- Project info (from cluster_projects)
  p.client_email AS project_client_email,
  p.client_name,

  -- Aggregated metrics (pre-computed)
  COALESCE(leads.leads_count, 0)::INTEGER AS leads_count,
  COALESCE(leads.whatsapp_count, 0)::INTEGER AS whatsapp_count,
  COALESCE(docs.docs_count, 0)::INTEGER AS docs_count,

  -- Check if client has user account
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.email = COALESCE(c.client_email, p.client_email)
  ) AS client_has_user,

  -- Generate slug from campaign name
  LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        TRANSLATE(
          c.campaign_name,
          'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÇç',
          'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOOooooooUUUUuuuuCc'
        ),
        '[^a-zA-Z0-9]+', '-', 'g'
      ),
      '^-+|-+$', '', 'g'
    )
  ) AS slug

FROM cluster_campaigns c

LEFT JOIN cluster_projects p ON c.project_id = p.id

-- Aggregate leads count and whatsapp count in a single subquery
LEFT JOIN LATERAL (
  SELECT
    COUNT(cl.id) AS leads_count,
    COUNT(CASE WHEN il.whatsapp_number IS NOT NULL THEN 1 END) AS whatsapp_count
  FROM campaign_leads cl
  LEFT JOIN instagram_leads il ON cl.lead_id = il.id
  WHERE cl.campaign_id = c.id
) leads ON TRUE

-- Aggregate documents count
LEFT JOIN LATERAL (
  SELECT COUNT(cd.id) AS docs_count
  FROM campaign_documents cd
  WHERE cd.campaign_id = c.id
) docs ON TRUE;

-- Add comment to document the view
COMMENT ON VIEW v_my_campaigns_enriched IS
'Optimized view for /api/aic/my-campaigns endpoint.
Pre-aggregates leads_count, whatsapp_count, docs_count to eliminate N+1 queries.
Reduces 40 queries (10 campaigns) to 1 query.
Created: 2026-02-06';

-- Grant permissions
GRANT SELECT ON v_my_campaigns_enriched TO authenticated;
GRANT SELECT ON v_my_campaigns_enriched TO service_role;
