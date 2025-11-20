-- ============================================================
-- MIGRAÇÃO: Tabela e Função de Rate Limiting
-- ============================================================
-- Data: 2024-11-20
-- Objetivo: Criar sistema de rate limiting para consultas SEFAZ
-- ============================================================

-- 1. Criar tabela rate_limits
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL,
  tipo_operacao TEXT NOT NULL, -- 'consultaChave', 'distribuicaoDFe', 'recepcaoEvento'
  janela_inicio TIMESTAMPTZ NOT NULL, -- Início da janela de 1 hora
  contador INTEGER NOT NULL DEFAULT 1, -- Número de consultas nesta janela
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Garante unicidade: 1 registro por (user_id, empresa_id, tipo_operacao, janela_inicio)
  UNIQUE(user_id, empresa_id, tipo_operacao, janela_inicio)
);

-- 2. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup 
ON public.rate_limits(user_id, empresa_id, tipo_operacao, janela_inicio);

-- Índice simples para cleanup (sem predicado NOW() que não é IMMUTABLE)
CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup 
ON public.rate_limits(janela_inicio);

-- 3. Habilitar RLS (Row Level Security)
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- 4. Criar políticas RLS - usuários só veem/modificam seus próprios registros
DROP POLICY IF EXISTS "Users can view their own rate limits" ON public.rate_limits;
CREATE POLICY "Users can view their own rate limits" ON public.rate_limits
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own rate limits" ON public.rate_limits;
CREATE POLICY "Users can insert their own rate limits" ON public.rate_limits
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own rate limits" ON public.rate_limits;
CREATE POLICY "Users can update their own rate limits" ON public.rate_limits
  FOR UPDATE
  USING (auth.uid() = user_id);

-- 5. Criar função de incremento e verificação de rate limit
CREATE OR REPLACE FUNCTION public.increment_and_check_rate_limit(
  p_user_id UUID,
  p_empresa_id UUID,
  p_tipo_operacao TEXT,
  p_limite INTEGER DEFAULT 20
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_janela_inicio TIMESTAMPTZ;
  v_contador INTEGER;
BEGIN
  -- Calcula início da janela atual (hora cheia)
  v_janela_inicio := DATE_TRUNC('hour', NOW());
  
  -- Tenta inserir novo registro ou incrementar contador existente
  INSERT INTO public.rate_limits (
    user_id,
    empresa_id,
    tipo_operacao,
    janela_inicio,
    contador,
    updated_at
  ) VALUES (
    p_user_id,
    p_empresa_id,
    p_tipo_operacao,
    v_janela_inicio,
    1,
    NOW()
  )
  ON CONFLICT (user_id, empresa_id, tipo_operacao, janela_inicio)
  DO UPDATE SET
    contador = rate_limits.contador + 1,
    updated_at = NOW()
  RETURNING contador INTO v_contador;
  
  -- Retorna TRUE se ainda está dentro do limite, FALSE se excedeu
  RETURN v_contador <= p_limite;
END;
$$;

-- 6. Criar função de limpeza de registros antigos (executar periodicamente)
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Deleta registros com mais de 2 horas
  DELETE FROM public.rate_limits
  WHERE janela_inicio < NOW() - INTERVAL '2 hours';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- 7. Revogar permissões públicas e conceder apenas ao service_role (SEGURANÇA CRÍTICA)
REVOKE ALL ON FUNCTION public.increment_and_check_rate_limit(UUID, UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_and_check_rate_limit(UUID, UUID, TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.cleanup_old_rate_limits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_rate_limits() TO service_role;

-- 8. Comentários para documentação
COMMENT ON TABLE public.rate_limits IS 'Controla rate limiting de consultas SEFAZ (máx 20/hora por empresa)';
COMMENT ON COLUMN public.rate_limits.janela_inicio IS 'Início da janela de 1 hora (truncado para hora cheia)';
COMMENT ON COLUMN public.rate_limits.contador IS 'Número de consultas feitas nesta janela';
COMMENT ON FUNCTION public.increment_and_check_rate_limit IS 'Incrementa contador e retorna TRUE se dentro do limite - APENAS service_role';
COMMENT ON FUNCTION public.cleanup_old_rate_limits IS 'Remove registros de rate limit com mais de 2 horas - APENAS service_role';

-- ============================================================
-- FIM DA MIGRAÇÃO
-- ============================================================
-- INSTRUÇÕES:
-- 1. Copie este SQL
-- 2. Abra Supabase Dashboard → SQL Editor
-- 3. Cole e execute
-- 4. Verifique: SELECT * FROM rate_limits LIMIT 5;
-- ============================================================
