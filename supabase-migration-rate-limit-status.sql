-- Migration: Rate Limiting SEFAZ + Status NFe
-- Data: 2025-11-20
-- Descrição: 
--   1. Cria tabela sefaz_rate_limit para controle de 20 consultas/hora
--   2. Adiciona campo status_nfe na tabela xmls (autorizada, cancelada, denegada, etc)

-- ========================================
-- 1. TABELA DE RATE LIMITING SEFAZ
-- ========================================

CREATE TABLE IF NOT EXISTS sefaz_rate_limit (
  user_id UUID NOT NULL,
  empresa_id VARCHAR NOT NULL,
  tipo_operacao VARCHAR NOT NULL, -- 'consultaChave', 'distribuicaoDFe', 'recepcaoEvento'
  contador INTEGER NOT NULL DEFAULT 0,
  janela_inicio TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraint: uma linha por (user_id, empresa_id, tipo_operacao)
  PRIMARY KEY (user_id, empresa_id, tipo_operacao),
  
  -- Foreign keys
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_sefaz_rate_limit_janela 
  ON sefaz_rate_limit(janela_inicio);

-- Row Level Security (RLS)
ALTER TABLE sefaz_rate_limit ENABLE ROW LEVEL SECURITY;

-- Policy: Usuários só veem seus próprios rate limits
CREATE POLICY "Users can view own rate limits"
  ON sefaz_rate_limit
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Sistema pode inserir/atualizar (service_role bypass RLS)
-- Não precisa de policy INSERT/UPDATE pois backend usa supabaseAdmin (service_role)

COMMENT ON TABLE sefaz_rate_limit IS 'Controle de rate limiting para evitar cStat 656 (máx 20 consultas/hora por empresa)';

-- ========================================
-- 2. CAMPO STATUS_NFE NA TABELA XMLS
-- ========================================

-- Adiciona campo status_nfe (se não existir)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'xmls' AND column_name = 'status_nfe'
  ) THEN
    ALTER TABLE xmls ADD COLUMN status_nfe VARCHAR(20) DEFAULT 'autorizada';
  END IF;
END $$;

-- Valores possíveis: 'autorizada', 'cancelada', 'denegada', 'inutilizada', 'uso_denegado'
COMMENT ON COLUMN xmls.status_nfe IS 'Status da NFe: autorizada (100), cancelada (101), denegada (110/301/302), etc';

-- Índice para queries por status
CREATE INDEX IF NOT EXISTS idx_xmls_status_nfe ON xmls(status_nfe);

-- ========================================
-- 3. ATUALIZAR STATUS E LIMPAR ERROS LEGACY
-- ========================================

-- Marca XMLs existentes como 'autorizada' (default seguro)
UPDATE xmls 
SET status_nfe = 'autorizada' 
WHERE status_nfe IS NULL;

-- Adiciona constraint NOT NULL após popular valores
ALTER TABLE xmls 
ALTER COLUMN status_nfe SET NOT NULL;

-- Limpa erros legacy de rate limit (XMLs ficaram presos antes da correção)
-- XMLs com erro "Rate limit" voltam para status pendente para retry automático
UPDATE xmls
SET status_download = 'pendente',
    erro_download = NULL
WHERE erro_download LIKE '%Rate limit%'
  AND status_download = 'erro'
  AND tipo_documento = 'resNFe';

RAISE NOTICE '→ Erros legacy de rate limit limpos - XMLs voltam para retry automático';

-- ========================================
-- 4. FUNÇÃO AUXILIAR: RESET RATE LIMIT
-- ========================================

-- Função para resetar contador quando janela de 1h expirou
CREATE OR REPLACE FUNCTION reset_rate_limit_if_expired(
  p_user_id UUID,
  p_empresa_id VARCHAR,
  p_tipo_operacao VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  v_janela_inicio TIMESTAMP;
  v_expirou BOOLEAN;
BEGIN
  -- Busca janela_inicio
  SELECT janela_inicio INTO v_janela_inicio
  FROM sefaz_rate_limit
  WHERE user_id = p_user_id 
    AND empresa_id = p_empresa_id 
    AND tipo_operacao = p_tipo_operacao;
  
  -- Se não existe registro, retorna true (pode criar novo)
  IF v_janela_inicio IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Verifica se já passou 1 hora
  v_expirou := (NOW() - v_janela_inicio) > INTERVAL '1 hour';
  
  -- Se expirou, reseta contador e janela
  IF v_expirou THEN
    UPDATE sefaz_rate_limit
    SET contador = 0,
        janela_inicio = NOW(),
        updated_at = NOW()
    WHERE user_id = p_user_id 
      AND empresa_id = p_empresa_id 
      AND tipo_operacao = p_tipo_operacao;
    
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION reset_rate_limit_if_expired IS 'Reseta contador se janela de 1h expirou';

-- ========================================
-- 5. FUNÇÃO: INCREMENTAR E VERIFICAR LIMITE
-- ========================================

CREATE OR REPLACE FUNCTION increment_and_check_rate_limit(
  p_user_id UUID,
  p_empresa_id VARCHAR,
  p_tipo_operacao VARCHAR,
  p_limite INTEGER DEFAULT 20
) RETURNS BOOLEAN AS $$
DECLARE
  v_contador INTEGER;
  v_pode_consultar BOOLEAN;
BEGIN
  -- Primeiro verifica/reseta se janela expirou
  PERFORM reset_rate_limit_if_expired(p_user_id, p_empresa_id, p_tipo_operacao);
  
  -- Insere ou atualiza contador (UPSERT)
  INSERT INTO sefaz_rate_limit (user_id, empresa_id, tipo_operacao, contador, janela_inicio)
  VALUES (p_user_id, p_empresa_id, p_tipo_operacao, 1, NOW())
  ON CONFLICT (user_id, empresa_id, tipo_operacao) 
  DO UPDATE SET 
    contador = sefaz_rate_limit.contador + 1,
    updated_at = NOW()
  RETURNING contador INTO v_contador;
  
  -- Verifica se está dentro do limite
  v_pode_consultar := (v_contador <= p_limite);
  
  RETURN v_pode_consultar;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_and_check_rate_limit IS 'Incrementa contador e retorna TRUE se está dentro do limite (default 20/hora)';

-- ========================================
-- MIGRATION COMPLETA
-- ========================================

-- Log de sucesso
DO $$
BEGIN
  RAISE NOTICE 'Migration rate-limit-status aplicada com sucesso!';
  RAISE NOTICE '- Tabela sefaz_rate_limit criada';
  RAISE NOTICE '- Campo status_nfe adicionado em xmls';
  RAISE NOTICE '- Funções de rate limiting criadas';
END $$;
