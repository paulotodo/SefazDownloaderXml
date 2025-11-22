-- ========================================
-- FIX: Rate Limiting - NÃO Incrementar Quando Já no Limite
-- ========================================
-- Data: 2025-11-22
-- Problema: RPC increment_and_check_rate_limit estava incrementando
--           contador MESMO quando retornava FALSE (já no limite)
-- Correção: Verificar ANTES de incrementar (SELECT first, then INSERT/UPDATE)

-- Remove função com bug
DROP FUNCTION IF EXISTS increment_and_check_rate_limit CASCADE;

-- Cria função corrigida
CREATE OR REPLACE FUNCTION increment_and_check_rate_limit(
  p_user_id UUID,
  p_empresa_id UUID,
  p_tipo_operacao VARCHAR,
  p_limite INTEGER DEFAULT 20
) RETURNS BOOLEAN AS $$
DECLARE
  v_contador INTEGER;
  v_pode_consultar BOOLEAN;
  v_janela_inicio TIMESTAMP;
BEGIN
  -- Primeiro verifica/reseta se janela expirou
  PERFORM reset_rate_limit_if_expired(p_user_id, p_empresa_id, p_tipo_operacao);
  
  -- CRÍTICO: SELECT PRIMEIRO para verificar contador atual
  SELECT contador, janela_inicio INTO v_contador, v_janela_inicio
  FROM sefaz_rate_limit
  WHERE user_id = p_user_id 
    AND empresa_id = p_empresa_id 
    AND tipo_operacao = p_tipo_operacao;
  
  -- Se não existe registro, cria com contador = 1
  IF v_contador IS NULL THEN
    INSERT INTO sefaz_rate_limit (user_id, empresa_id, tipo_operacao, contador, janela_inicio)
    VALUES (p_user_id, p_empresa_id, p_tipo_operacao, 1, NOW());
    RETURN TRUE; -- Primeira consulta sempre permitida
  END IF;
  
  -- Se já está no limite, retorna FALSE SEM incrementar
  IF v_contador >= p_limite THEN
    RETURN FALSE;
  END IF;
  
  -- Se está abaixo do limite, incrementa e retorna TRUE
  UPDATE sefaz_rate_limit
  SET contador = contador + 1,
      updated_at = NOW()
  WHERE user_id = p_user_id 
    AND empresa_id = p_empresa_id 
    AND tipo_operacao = p_tipo_operacao;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_and_check_rate_limit IS 
  'Incrementa contador APENAS se está abaixo do limite (default 20/hora). ' ||
  'Retorna TRUE se pode consultar, FALSE se limite atingido. ' ||
  'CORRIGIDO: NÃO incrementa quando já no limite.';

-- Limpa contadores acima de 20 (causados pelo bug anterior)
UPDATE sefaz_rate_limit
SET contador = 20
WHERE contador > 20;

-- Log de sucesso
DO $$
BEGIN
  RAISE NOTICE '✅ Fix aplicado: increment_and_check_rate_limit corrigido';
  RAISE NOTICE '   - Agora verifica ANTES de incrementar';
  RAISE NOTICE '   - Não incrementa quando já no limite';
  RAISE NOTICE '   - Contadores > 20 foram resetados para 20';
END $$;
