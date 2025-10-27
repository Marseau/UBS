-- Migration: Create editorial_weeks table
-- Created: 2025-10-04
-- Purpose: Manage weekly editorial themes and track generation status

CREATE TABLE IF NOT EXISTS editorial_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  main_theme TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',  -- pending, generated, published, archived
  generated_at TIMESTAMP,
  generated_by VARCHAR(100) DEFAULT 'n8n-workflow',
  api_cost_usd DECIMAL(10,6) DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  generation_time_ms INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(week_number, year)
);

-- Add comments
COMMENT ON TABLE editorial_weeks IS 'Manage weekly editorial calendar and generation tracking';
COMMENT ON COLUMN editorial_weeks.status IS 'pending: not generated yet, generated: content created, published: content live, archived: past week';
COMMENT ON COLUMN editorial_weeks.api_cost_usd IS 'Total OpenAI API cost for generating this week content';
COMMENT ON COLUMN editorial_weeks.total_tokens IS 'Total tokens used for this week generation';
COMMENT ON COLUMN editorial_weeks.generation_time_ms IS 'Time taken to generate content in milliseconds';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_editorial_weeks_status ON editorial_weeks(status);
CREATE INDEX IF NOT EXISTS idx_editorial_weeks_year_week ON editorial_weeks(year, week_number);
CREATE INDEX IF NOT EXISTS idx_editorial_weeks_generated_at ON editorial_weeks(generated_at);

-- Insert initial weeks for testing
INSERT INTO editorial_weeks (week_number, year, main_theme, status, notes)
VALUES
  (40, 2025, 'Automação de Captação de Leads', 'pending', 'Primeira semana - foco em agências digitais'),
  (41, 2025, 'Qualificação Inteligente de Leads', 'pending', 'Segunda semana - foco em qualificação automática'),
  (42, 2025, 'Agendamento sem No-Shows', 'pending', 'Terceira semana - foco em redução de faltas'),
  (43, 2025, 'ROI Mensurável com Dashboard', 'pending', 'Quarta semana - foco em métricas e dados')
ON CONFLICT (week_number, year) DO NOTHING;
