-- Migration: Converter TIMESTAMP para TIMESTAMPTZ preservando valores existentes como UTC
-- 
-- CRÍTICO: Usa "AT TIME ZONE 'UTC'" para indicar que valores existentes JÁ SÃO UTC
-- Isso evita conversão errônea que adicionaria +3h aos timestamps
--
-- ANTES de executar: FAÇA BACKUP do banco!
-- TESTE primeiro em ambiente de staging/desenvolvimento

-- 1. Converter coluna bloqueado_ate em empresas
ALTER TABLE empresas 
  ALTER COLUMN bloqueado_ate 
  TYPE timestamptz 
  USING bloqueado_ate AT TIME ZONE 'UTC';

-- 2. Converter colunas de timestamp em profiles
ALTER TABLE profiles 
  ALTER COLUMN created_at 
  TYPE timestamptz 
  USING created_at AT TIME ZONE 'UTC';

ALTER TABLE profiles 
  ALTER COLUMN updated_at 
  TYPE timestamptz 
  USING updated_at AT TIME ZONE 'UTC';

-- 3. Converter colunas de timestamp em empresas
ALTER TABLE empresas 
  ALTER COLUMN created_at 
  TYPE timestamptz 
  USING created_at AT TIME ZONE 'UTC';

ALTER TABLE empresas 
  ALTER COLUMN updated_at 
  TYPE timestamptz 
  USING updated_at AT TIME ZONE 'UTC';

-- 4. Converter colunas de timestamp em sincronizacoes
ALTER TABLE sincronizacoes 
  ALTER COLUMN data_inicio 
  TYPE timestamptz 
  USING data_inicio AT TIME ZONE 'UTC';

ALTER TABLE sincronizacoes 
  ALTER COLUMN data_fim 
  TYPE timestamptz 
  USING data_fim AT TIME ZONE 'UTC';

ALTER TABLE sincronizacoes 
  ALTER COLUMN created_at 
  TYPE timestamptz 
  USING created_at AT TIME ZONE 'UTC';

-- 5. Converter colunas de timestamp em xmls
ALTER TABLE xmls 
  ALTER COLUMN data_emissao 
  TYPE timestamptz 
  USING data_emissao AT TIME ZONE 'UTC';

ALTER TABLE xmls 
  ALTER COLUMN created_at 
  TYPE timestamptz 
  USING created_at AT TIME ZONE 'UTC';

-- 6. Converter colunas de timestamp em logs
ALTER TABLE logs 
  ALTER COLUMN timestamp 
  TYPE timestamptz 
  USING timestamp AT TIME ZONE 'UTC';

-- 7. Comentários para documentação
COMMENT ON COLUMN empresas.bloqueado_ate IS 'Timestamp UTC indicando até quando empresa está bloqueada pela SEFAZ (erro 656). Armazenado em UTC, exibir em America/Sao_Paulo.';
COMMENT ON COLUMN sincronizacoes.data_inicio IS 'Timestamp UTC de início da sincronização. Armazenado em UTC, exibir em America/Sao_Paulo.';
COMMENT ON COLUMN sincronizacoes.data_fim IS 'Timestamp UTC de fim da sincronização. Armazenado em UTC, exibir em America/Sao_Paulo.';
COMMENT ON COLUMN logs.timestamp IS 'Timestamp UTC do log. Armazenado em UTC, exibir em America/Sao_Paulo.';

-- 8. Verificar conversão (executar APÓS migração para validar)
-- SELECT 
--   id, 
--   cnpj, 
--   bloqueado_ate,
--   pg_typeof(bloqueado_ate) as tipo
-- FROM empresas 
-- LIMIT 5;
