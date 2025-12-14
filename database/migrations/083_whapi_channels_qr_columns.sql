-- =====================================================
-- MIGRATION 083: Whapi Channels - QR Code Support
-- Data: 2025-12-13
-- Objetivo: Adicionar colunas para armazenar QR Code e status de conexão
-- =====================================================

-- Adicionar colunas de QR Code
ALTER TABLE whapi_channels
ADD COLUMN IF NOT EXISTS qr_code_data TEXT,
ADD COLUMN IF NOT EXISTS qr_code_generated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_connected_at TIMESTAMP WITH TIME ZONE;

-- Comentários
COMMENT ON COLUMN whapi_channels.qr_code_data IS 'QR Code em base64 para conexão - temporário, limpar após conexão';
COMMENT ON COLUMN whapi_channels.qr_code_generated_at IS 'Timestamp de quando o QR Code foi gerado';
COMMENT ON COLUMN whapi_channels.last_connected_at IS 'Última vez que o canal conectou com sucesso';
