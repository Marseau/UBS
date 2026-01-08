-- ============================================================================
-- AIC FINANCIAL MODEL
-- Modelo financeiro para controle de pagamentos, entregas e faturas
-- ============================================================================

-- ============================================================================
-- 1. PAGAMENTOS DO CONTRATO (entrada 50% + final 50%)
-- ============================================================================

CREATE TABLE IF NOT EXISTS aic_contract_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES aic_contracts(id) ON DELETE CASCADE,
  journey_id UUID REFERENCES aic_client_journeys(id) ON DELETE SET NULL,

  -- Tipo de pagamento
  payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN ('entrada', 'final', 'adicional')),
  installment_number INT NOT NULL DEFAULT 1,

  -- Valores
  amount DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  paid_at TIMESTAMPTZ,
  payment_method VARCHAR(50), -- pix, boleto, cartao, transferencia
  payment_reference VARCHAR(255), -- comprovante/ID transacao

  -- Cobranca
  reminder_sent_at TIMESTAMPTZ,
  reminder_count INT DEFAULT 0,

  -- Auditoria
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  UNIQUE(contract_id, payment_type, installment_number)
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_contract_payments_contract ON aic_contract_payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_payments_journey ON aic_contract_payments(journey_id);
CREATE INDEX IF NOT EXISTS idx_contract_payments_status ON aic_contract_payments(status);
CREATE INDEX IF NOT EXISTS idx_contract_payments_due_date ON aic_contract_payments(due_date);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_contract_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_contract_payments_updated_at ON aic_contract_payments;
CREATE TRIGGER trigger_contract_payments_updated_at
  BEFORE UPDATE ON aic_contract_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_contract_payments_updated_at();

-- ============================================================================
-- 2. ENTREGAS DE LEADS QUENTES
-- ============================================================================

CREATE TABLE IF NOT EXISTS aic_hot_lead_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES cluster_campaigns(id) ON DELETE CASCADE,
  journey_id UUID REFERENCES aic_client_journeys(id) ON DELETE SET NULL,

  -- Lead entregue
  lead_id UUID REFERENCES instagram_leads(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES aic_conversations(id) ON DELETE SET NULL,

  -- Tipo de conversao
  delivery_type VARCHAR(30) NOT NULL CHECK (delivery_type IN (
    'reuniao_marcada',
    'whatsapp_capturado',
    'interesse_confirmado',
    'proposta_enviada',
    'negociacao'
  )),

  -- Dados do lead (snapshot no momento da entrega)
  lead_name VARCHAR(255) NOT NULL,
  lead_phone VARCHAR(50),
  lead_instagram VARCHAR(100),
  lead_email VARCHAR(255),
  lead_company VARCHAR(255),

  -- Reuniao (se aplicavel)
  meeting_scheduled_at TIMESTAMPTZ,
  meeting_link TEXT,
  meeting_status VARCHAR(20) CHECK (meeting_status IN ('scheduled', 'completed', 'no_show', 'cancelled')),

  -- Qualificacao
  qualification_score INT CHECK (qualification_score BETWEEN 1 AND 10),
  qualification_notes TEXT,
  conversation_summary TEXT,

  -- Cobranca
  billable BOOLEAN DEFAULT true,
  unit_value DECIMAL(10,2),
  invoice_id UUID, -- sera FK para aic_delivery_invoices

  -- Auditoria
  delivered_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_hot_lead_deliveries_campaign ON aic_hot_lead_deliveries(campaign_id);
CREATE INDEX IF NOT EXISTS idx_hot_lead_deliveries_journey ON aic_hot_lead_deliveries(journey_id);
CREATE INDEX IF NOT EXISTS idx_hot_lead_deliveries_lead ON aic_hot_lead_deliveries(lead_id);
CREATE INDEX IF NOT EXISTS idx_hot_lead_deliveries_invoice ON aic_hot_lead_deliveries(invoice_id);
CREATE INDEX IF NOT EXISTS idx_hot_lead_deliveries_type ON aic_hot_lead_deliveries(delivery_type);
CREATE INDEX IF NOT EXISTS idx_hot_lead_deliveries_delivered_at ON aic_hot_lead_deliveries(delivered_at);
CREATE INDEX IF NOT EXISTS idx_hot_lead_deliveries_billable ON aic_hot_lead_deliveries(billable) WHERE billable = true;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_hot_lead_deliveries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_hot_lead_deliveries_updated_at ON aic_hot_lead_deliveries;
CREATE TRIGGER trigger_hot_lead_deliveries_updated_at
  BEFORE UPDATE ON aic_hot_lead_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION update_hot_lead_deliveries_updated_at();

-- ============================================================================
-- 3. FATURAS DE ENTREGAS
-- ============================================================================

CREATE TABLE IF NOT EXISTS aic_delivery_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES aic_contracts(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES cluster_campaigns(id) ON DELETE SET NULL,
  journey_id UUID REFERENCES aic_client_journeys(id) ON DELETE SET NULL,

  -- Identificacao
  invoice_number VARCHAR(20) UNIQUE NOT NULL,

  -- Tipo
  invoice_type VARCHAR(30) NOT NULL DEFAULT 'leads_quentes' CHECK (invoice_type IN (
    'leads_quentes',
    'reunioes',
    'mensal',
    'avulsa'
  )),

  -- Periodo de referencia
  period_start DATE,
  period_end DATE,

  -- Quantidades
  hot_leads_count INT DEFAULT 0,
  meetings_count INT DEFAULT 0,
  whatsapp_captured_count INT DEFAULT 0,

  -- Valores
  unit_price DECIMAL(10,2),
  subtotal DECIMAL(10,2) NOT NULL,
  discount DECIMAL(10,2) DEFAULT 0,
  discount_reason TEXT,
  total DECIMAL(10,2) NOT NULL,

  -- Datas
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'pending',
    'sent',
    'paid',
    'overdue',
    'cancelled',
    'disputed'
  )),

  -- Envio
  sent_at TIMESTAMPTZ,
  sent_to_email VARCHAR(255),

  -- Pagamento
  paid_at TIMESTAMPTZ,
  payment_method VARCHAR(50),
  payment_reference VARCHAR(255),

  -- Dados para cobranca
  pix_code TEXT,
  boleto_url TEXT,
  boleto_barcode VARCHAR(50),

  -- Relatorio de auditoria
  audit_report_url TEXT,

  -- Notas
  notes TEXT,

  -- Auditoria
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_delivery_invoices_contract ON aic_delivery_invoices(contract_id);
CREATE INDEX IF NOT EXISTS idx_delivery_invoices_campaign ON aic_delivery_invoices(campaign_id);
CREATE INDEX IF NOT EXISTS idx_delivery_invoices_journey ON aic_delivery_invoices(journey_id);
CREATE INDEX IF NOT EXISTS idx_delivery_invoices_status ON aic_delivery_invoices(status);
CREATE INDEX IF NOT EXISTS idx_delivery_invoices_due_date ON aic_delivery_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_delivery_invoices_number ON aic_delivery_invoices(invoice_number);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_delivery_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_delivery_invoices_updated_at ON aic_delivery_invoices;
CREATE TRIGGER trigger_delivery_invoices_updated_at
  BEFORE UPDATE ON aic_delivery_invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_delivery_invoices_updated_at();

-- Adicionar FK de invoice_id em hot_lead_deliveries
ALTER TABLE aic_hot_lead_deliveries
  DROP CONSTRAINT IF EXISTS fk_hot_lead_deliveries_invoice;

ALTER TABLE aic_hot_lead_deliveries
  ADD CONSTRAINT fk_hot_lead_deliveries_invoice
  FOREIGN KEY (invoice_id) REFERENCES aic_delivery_invoices(id) ON DELETE SET NULL;

-- ============================================================================
-- 4. SEQUENCIA PARA NUMERO DE FATURA
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS aic_invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS VARCHAR(20) AS $$
DECLARE
  seq_val INT;
  year_str VARCHAR(4);
BEGIN
  seq_val := nextval('aic_invoice_number_seq');
  year_str := to_char(CURRENT_DATE, 'YYYY');
  RETURN 'AIC-' || year_str || '-' || lpad(seq_val::text, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Trigger para gerar numero automaticamente
CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_invoice_number ON aic_delivery_invoices;
CREATE TRIGGER trigger_set_invoice_number
  BEFORE INSERT ON aic_delivery_invoices
  FOR EACH ROW
  EXECUTE FUNCTION set_invoice_number();

-- ============================================================================
-- 5. VIEW PARA RELATORIO DE AUDITORIA
-- ============================================================================

CREATE OR REPLACE VIEW aic_delivery_audit_report AS
SELECT
  i.id AS invoice_id,
  i.invoice_number,
  i.period_start,
  i.period_end,
  i.status AS invoice_status,
  i.total AS invoice_total,

  -- Campanha
  c.id AS campaign_id,
  c.campaign_name,

  -- Cliente (do contrato)
  ct.client_name,
  ct.client_email,
  ct.client_phone AS client_phone,

  -- Lead entregue
  h.id AS delivery_id,
  h.lead_name,
  h.lead_phone,
  h.lead_instagram,
  h.lead_email,
  h.delivery_type,
  h.delivered_at,

  -- Reuniao
  h.meeting_scheduled_at,
  h.meeting_status,

  -- Qualificacao
  h.qualification_score,
  h.conversation_summary,

  -- Valor
  h.unit_value,
  h.billable

FROM aic_hot_lead_deliveries h
LEFT JOIN aic_delivery_invoices i ON h.invoice_id = i.id
LEFT JOIN cluster_campaigns c ON h.campaign_id = c.id
LEFT JOIN aic_contracts ct ON i.contract_id = ct.id
WHERE h.billable = true
ORDER BY h.delivered_at DESC;

-- ============================================================================
-- 6. FUNCAO PARA CRIAR PAGAMENTOS DO CONTRATO AUTOMATICAMENTE
-- ============================================================================

CREATE OR REPLACE FUNCTION create_contract_payments(
  p_contract_id UUID,
  p_journey_id UUID,
  p_total_value DECIMAL(10,2),
  p_signed_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE(payment_id UUID, payment_type VARCHAR, amount DECIMAL, due_date DATE) AS $$
DECLARE
  v_entrada_value DECIMAL(10,2);
  v_final_value DECIMAL(10,2);
  v_entrada_id UUID;
  v_final_id UUID;
BEGIN
  -- Calcular valores (50% / 50%)
  v_entrada_value := ROUND(p_total_value * 0.5, 2);
  v_final_value := p_total_value - v_entrada_value;

  -- Criar pagamento de entrada (vencimento imediato)
  INSERT INTO aic_contract_payments (
    contract_id, journey_id, payment_type, installment_number,
    amount, due_date, status
  ) VALUES (
    p_contract_id, p_journey_id, 'entrada', 1,
    v_entrada_value, (p_signed_at AT TIME ZONE 'America/Sao_Paulo')::DATE, 'pending'
  )
  RETURNING id INTO v_entrada_id;

  -- Criar pagamento final (15 dias apos assinatura)
  INSERT INTO aic_contract_payments (
    contract_id, journey_id, payment_type, installment_number,
    amount, due_date, status
  ) VALUES (
    p_contract_id, p_journey_id, 'final', 2,
    v_final_value, ((p_signed_at AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '15 days')::DATE, 'pending'
  )
  RETURNING id INTO v_final_id;

  -- Retornar pagamentos criados
  RETURN QUERY
  SELECT cp.id, cp.payment_type, cp.amount, cp.due_date
  FROM aic_contract_payments cp
  WHERE cp.contract_id = p_contract_id
  ORDER BY cp.installment_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. FUNCAO PARA CRIAR FATURA DE ENTREGAS
-- ============================================================================

CREATE OR REPLACE FUNCTION create_delivery_invoice(
  p_campaign_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_unit_price DECIMAL(10,2) DEFAULT 150.00,
  p_due_days INT DEFAULT 5
)
RETURNS UUID AS $$
DECLARE
  v_invoice_id UUID;
  v_contract_id UUID;
  v_journey_id UUID;
  v_hot_leads_count INT;
  v_meetings_count INT;
  v_whatsapp_count INT;
  v_subtotal DECIMAL(10,2);
BEGIN
  -- Buscar contract_id e journey_id da campanha
  SELECT j.contract_id, j.id INTO v_contract_id, v_journey_id
  FROM aic_client_journeys j
  WHERE j.campaign_id = p_campaign_id
  LIMIT 1;

  -- Contar entregas no periodo (nao faturadas)
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE delivery_type = 'reuniao_marcada'),
    COUNT(*) FILTER (WHERE delivery_type = 'whatsapp_capturado')
  INTO v_hot_leads_count, v_meetings_count, v_whatsapp_count
  FROM aic_hot_lead_deliveries
  WHERE campaign_id = p_campaign_id
    AND billable = true
    AND invoice_id IS NULL
    AND delivered_at >= p_period_start
    AND delivered_at < p_period_end + INTERVAL '1 day';

  IF v_hot_leads_count = 0 THEN
    RAISE EXCEPTION 'Nenhuma entrega encontrada no periodo';
  END IF;

  -- Calcular subtotal
  v_subtotal := v_hot_leads_count * p_unit_price;

  -- Criar fatura
  INSERT INTO aic_delivery_invoices (
    contract_id, campaign_id, journey_id,
    invoice_type, period_start, period_end,
    hot_leads_count, meetings_count, whatsapp_captured_count,
    unit_price, subtotal, total,
    due_date, status
  ) VALUES (
    v_contract_id, p_campaign_id, v_journey_id,
    'leads_quentes', p_period_start, p_period_end,
    v_hot_leads_count, v_meetings_count, v_whatsapp_count,
    p_unit_price, v_subtotal, v_subtotal,
    CURRENT_DATE + p_due_days, 'draft'
  )
  RETURNING id INTO v_invoice_id;

  -- Vincular entregas a fatura
  UPDATE aic_hot_lead_deliveries
  SET invoice_id = v_invoice_id, unit_value = p_unit_price
  WHERE campaign_id = p_campaign_id
    AND billable = true
    AND invoice_id IS NULL
    AND delivered_at >= p_period_start
    AND delivered_at < p_period_end + INTERVAL '1 day';

  RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. FUNCAO PARA VERIFICAR PAGAMENTOS VENCIDOS
-- ============================================================================

CREATE OR REPLACE FUNCTION check_overdue_payments()
RETURNS TABLE(
  payment_id UUID,
  contract_id UUID,
  payment_type VARCHAR,
  amount DECIMAL,
  due_date DATE,
  days_overdue INT,
  client_name VARCHAR,
  client_email VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.id,
    cp.contract_id,
    cp.payment_type,
    cp.amount,
    cp.due_date,
    (CURRENT_DATE - cp.due_date)::INT AS days_overdue,
    c.client_name,
    c.client_email
  FROM aic_contract_payments cp
  JOIN aic_contracts c ON cp.contract_id = c.id
  WHERE cp.status = 'pending'
    AND cp.due_date < CURRENT_DATE
  ORDER BY cp.due_date;

  -- Atualizar status para overdue
  UPDATE aic_contract_payments
  SET status = 'overdue'
  WHERE status = 'pending'
    AND due_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. FUNCAO PARA DASHBOARD FINANCEIRO
-- ============================================================================

CREATE OR REPLACE FUNCTION get_financial_dashboard(p_campaign_id UUID DEFAULT NULL)
RETURNS TABLE(
  metric VARCHAR,
  value DECIMAL,
  count INT
) AS $$
BEGIN
  RETURN QUERY

  -- Pagamentos pendentes
  SELECT
    'pagamentos_pendentes'::VARCHAR,
    COALESCE(SUM(cp.amount), 0)::DECIMAL,
    COUNT(*)::INT
  FROM aic_contract_payments cp
  LEFT JOIN aic_client_journeys j ON cp.journey_id = j.id
  WHERE cp.status IN ('pending', 'overdue')
    AND (p_campaign_id IS NULL OR j.campaign_id = p_campaign_id)

  UNION ALL

  -- Pagamentos recebidos
  SELECT
    'pagamentos_recebidos'::VARCHAR,
    COALESCE(SUM(cp.amount), 0)::DECIMAL,
    COUNT(*)::INT
  FROM aic_contract_payments cp
  LEFT JOIN aic_client_journeys j ON cp.journey_id = j.id
  WHERE cp.status = 'paid'
    AND (p_campaign_id IS NULL OR j.campaign_id = p_campaign_id)

  UNION ALL

  -- Leads quentes entregues
  SELECT
    'leads_quentes_entregues'::VARCHAR,
    COALESCE(SUM(h.unit_value), 0)::DECIMAL,
    COUNT(*)::INT
  FROM aic_hot_lead_deliveries h
  WHERE h.billable = true
    AND (p_campaign_id IS NULL OR h.campaign_id = p_campaign_id)

  UNION ALL

  -- Faturas pendentes
  SELECT
    'faturas_pendentes'::VARCHAR,
    COALESCE(SUM(i.total), 0)::DECIMAL,
    COUNT(*)::INT
  FROM aic_delivery_invoices i
  WHERE i.status IN ('pending', 'sent', 'overdue')
    AND (p_campaign_id IS NULL OR i.campaign_id = p_campaign_id)

  UNION ALL

  -- Faturas pagas
  SELECT
    'faturas_pagas'::VARCHAR,
    COALESCE(SUM(i.total), 0)::DECIMAL,
    COUNT(*)::INT
  FROM aic_delivery_invoices i
  WHERE i.status = 'paid'
    AND (p_campaign_id IS NULL OR i.campaign_id = p_campaign_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. RLS POLICIES
-- ============================================================================

ALTER TABLE aic_contract_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE aic_hot_lead_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE aic_delivery_invoices ENABLE ROW LEVEL SECURITY;

-- Policies para service role (bypass)
CREATE POLICY "Service role full access on contract_payments"
  ON aic_contract_payments FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on hot_lead_deliveries"
  ON aic_hot_lead_deliveries FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on delivery_invoices"
  ON aic_delivery_invoices FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- COMENTARIOS
-- ============================================================================

COMMENT ON TABLE aic_contract_payments IS 'Pagamentos do contrato (50% entrada + 50% final)';
COMMENT ON TABLE aic_hot_lead_deliveries IS 'Entregas de leads quentes (reunioes marcadas, WhatsApp capturado)';
COMMENT ON TABLE aic_delivery_invoices IS 'Faturas das entregas de leads quentes';
COMMENT ON VIEW aic_delivery_audit_report IS 'Relatorio de auditoria para o cliente validar cobranças';
COMMENT ON FUNCTION create_contract_payments IS 'Cria pagamentos 50/50 automaticamente ao assinar contrato';
COMMENT ON FUNCTION create_delivery_invoice IS 'Cria fatura com base nas entregas de um periodo';
COMMENT ON FUNCTION check_overdue_payments IS 'Verifica e atualiza pagamentos vencidos';
COMMENT ON FUNCTION get_financial_dashboard IS 'Metricas financeiras para dashboard';
