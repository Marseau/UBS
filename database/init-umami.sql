-- =====================================================
-- UMAMI DATABASE INITIALIZATION
-- Cria database para o Umami Analytics
-- =====================================================

-- Criar database umami se não existir
SELECT 'CREATE DATABASE umami'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'umami')\gexec

-- Conectar ao database umami
\c umami

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE umami TO postgres;

-- O Umami criará as tabelas automaticamente na primeira execução
