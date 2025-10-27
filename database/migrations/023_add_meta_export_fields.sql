-- Migration 023: Add Meta Export Fields to taylor_made_leads
-- Adiciona campos para controlar exportação de leads para Meta Custom Audiences

-- 1. Adicionar campos de exportação na tabela taylor_made_leads
ALTER TABLE taylor_made_leads
ADD COLUMN IF NOT EXISTS exported_to_meta BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS meta_export_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS times_discovered INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Criar tabela para log de exportações
CREATE TABLE IF NOT EXISTS meta_audience_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_name VARCHAR(100) NOT NULL,
  file_url TEXT NOT NULL,
  total_leads_exported INTEGER NOT NULL,
  export_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'ready_for_upload', -- ready_for_upload, uploaded, failed
  meta_audience_id VARCHAR(100), -- ID retornado pela Meta após upload
  upload_date TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_taylor_made_leads_exported
ON taylor_made_leads(exported_to_meta, lead_status)
WHERE exported_to_meta = false;

CREATE INDEX IF NOT EXISTS idx_taylor_made_leads_segment
ON taylor_made_leads(target_segment);

CREATE INDEX IF NOT EXISTS idx_meta_exports_segment
ON meta_audience_exports(segment_name, export_date);

CREATE INDEX IF NOT EXISTS idx_meta_exports_status
ON meta_audience_exports(status);

-- 4. Comentários para documentação
COMMENT ON COLUMN taylor_made_leads.exported_to_meta IS 'Indica se o lead foi exportado para Meta Custom Audience';
COMMENT ON COLUMN taylor_made_leads.meta_export_date IS 'Data da última exportação para Meta';
COMMENT ON COLUMN taylor_made_leads.times_discovered IS 'Número de vezes que o perfil foi redescoberto';
COMMENT ON COLUMN taylor_made_leads.last_seen_at IS 'Última vez que o perfil foi visto/descoberto';

COMMENT ON TABLE meta_audience_exports IS 'Log de exportações de Custom Audiences para Meta Ads';
COMMENT ON COLUMN meta_audience_exports.segment_name IS 'Nome do segmento exportado (ex: saude_psicologia)';
COMMENT ON COLUMN meta_audience_exports.file_url IS 'URL pública do CSV no Supabase Storage';
COMMENT ON COLUMN meta_audience_exports.meta_audience_id IS 'ID da Custom Audience criada na Meta';

-- 5. Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_meta_exports_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_meta_exports_timestamp
BEFORE UPDATE ON meta_audience_exports
FOR EACH ROW
EXECUTE FUNCTION update_meta_exports_timestamp();

-- 6. Função para obter estatísticas de exportação
CREATE OR REPLACE FUNCTION get_meta_export_stats()
RETURNS TABLE (
  total_exports INTEGER,
  total_leads_exported BIGINT,
  segments_count INTEGER,
  last_export_date TIMESTAMP WITH TIME ZONE,
  pending_leads_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_exports,
    SUM(total_leads_exported) as total_leads_exported,
    COUNT(DISTINCT segment_name)::INTEGER as segments_count,
    MAX(export_date) as last_export_date,
    (SELECT COUNT(*) FROM taylor_made_leads
     WHERE exported_to_meta = false
     AND lead_status = 'qualified') as pending_leads_count
  FROM meta_audience_exports;
END;
$$ LANGUAGE plpgsql;

-- 7. Grant permissions
GRANT SELECT, INSERT, UPDATE ON meta_audience_exports TO authenticated;
GRANT SELECT ON meta_audience_exports TO anon;
GRANT EXECUTE ON FUNCTION get_meta_export_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_meta_export_stats() TO anon;
