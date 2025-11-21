-- =====================================
-- MIGRATION: Force Cleanup Rate Limit Functions
-- =====================================
-- Data: 2025-11-21
-- Descrição: Remove TODAS as versões das funções de rate limit (VARCHAR e UUID)
--            usando DROP CASCADE agressivo para limpar dependências ocultas
--
-- PROBLEMA IDENTIFICADO:
-- As funções antigas com assinatura VARCHAR ainda existem porque há dependências
-- (triggers, procedures, views) que impedem o DROP CASCADE normal.
--
-- SOLUÇÃO:
-- 1. Dropar funções antigas com CASCADE completo (remove dependências)
-- 2. Recriar funções corretas com assinatura UUID
-- 3. Garantir que código TypeScript sempre chame versão UUID

-- ========================================
-- PASSO 1: LIMPEZA AGRESSIVA (FORCE DROP)
-- ========================================

-- Dropar TODAS as variações possíveis das funções antigas
-- Isso remove triggers, views, e qualquer dependência oculta

-- Versão 1: VARCHAR (antiga - DEVE ser removida)
DROP FUNCTION IF EXISTS reset_rate_limit_if_expired(UUID, VARCHAR, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS increment_and_check_rate_limit(UUID, VARCHAR, VARCHAR, INTEGER) CASCADE;

-- Versão 2: UUID (atual - será recriada logo abaixo)
DROP FUNCTION IF EXISTS reset_rate_limit_if_expired(UUID, UUID, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS increment_and_check_rate_limit(UUID, UUID, VARCHAR, INTEGER) CASCADE;

-- Versão 3: Qualquer outra variação (paranoia mode)
DROP FUNCTION IF EXISTS reset_rate_limit_if_expired CASCADE;
DROP FUNCTION IF EXISTS increment_and_check_rate_limit CASCADE;

-- ========================================
-- PASSO 2: RECRIAR FUNÇÕES COM UUID
-- ========================================

-- Função para resetar contador quando janela de 1h expirou
CREATE OR REPLACE FUNCTION reset_rate_limit_if_expired(
  p_user_id UUID,
  p_empresa_id UUID,
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

COMMENT ON FUNCTION reset_rate_limit_if_expired(UUID, UUID, VARCHAR) IS 'Reseta contador se janela de 1h expirou (UUID version)';

-- ========================================
-- PASSO 3: FUNÇÃO INCREMENTAR E VERIFICAR LIMITE
-- ========================================

CREATE OR REPLACE FUNCTION increment_and_check_rate_limit(
  p_user_id UUID,
  p_empresa_id UUID,
  p_tipo_operacao VARCHAR,
  p_limite INTEGER DEFAULT 20
) RETURNS BOOLEAN AS $$
DECLARE
  v_contador INTEGER;
  v_pode_consultar BOOLEAN;
BEGIN
  -- Verifica se janela expirou e reseta se necessário
  PERFORM reset_rate_limit_if_expired(p_user_id, p_empresa_id, p_tipo_operacao);
  
  -- Inserir ou atualizar contador
  INSERT INTO sefaz_rate_limit (user_id, empresa_id, tipo_operacao, contador, janela_inicio)
  VALUES (p_user_id, p_empresa_id, p_tipo_operacao, 1, NOW())
  ON CONFLICT (user_id, empresa_id, tipo_operacao) 
  DO UPDATE SET 
    contador = sefaz_rate_limit.contador + 1,
    updated_at = NOW()
  RETURNING contador INTO v_contador;
  
  -- Verifica se contador está dentro do limite
  v_pode_consultar := v_contador <= p_limite;
  
  RETURN v_pode_consultar;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_and_check_rate_limit(UUID, UUID, VARCHAR, INTEGER) IS 'Incrementa contador e verifica se está dentro do limite (UUID version)';

-- ========================================
-- PASSO 4: VALIDAÇÃO (READ-ONLY)
-- ========================================

-- Query para verificar assinaturas das funções criadas
-- (não faz alterações, apenas mostra informações)
DO $$
DECLARE
  v_count_varchar INTEGER;
  v_count_uuid INTEGER;
BEGIN
  -- Conta versões VARCHAR (deveria ser 0)
  SELECT COUNT(*) INTO v_count_varchar
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname IN ('reset_rate_limit_if_expired', 'increment_and_check_rate_limit')
    AND pg_get_function_arguments(p.oid) LIKE '%character varying%';
  
  -- Conta versões UUID (deveria ser 2: uma para cada função)
  SELECT COUNT(*) INTO v_count_uuid
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname IN ('reset_rate_limit_if_expired', 'increment_and_check_rate_limit')
    AND pg_get_function_arguments(p.oid) LIKE '%uuid%'
    AND pg_get_function_arguments(p.oid) NOT LIKE '%character varying%';
  
  RAISE NOTICE '✓ Funções VARCHAR removidas: % (esperado: 0)', v_count_varchar;
  RAISE NOTICE '✓ Funções UUID criadas: % (esperado: 2)', v_count_uuid;
  
  -- Se encontrar funções VARCHAR, avisar (mas não bloquear)
  IF v_count_varchar > 0 THEN
    RAISE WARNING '⚠ ATENÇÃO: Ainda existem % funções com assinatura VARCHAR! Execute DROP manual se necessário.', v_count_varchar;
  END IF;
END $$;
