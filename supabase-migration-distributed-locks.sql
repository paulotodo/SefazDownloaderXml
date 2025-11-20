-- Migration: Distributed Locks para Download Automático de XMLs
-- Criado em: 2025-11-20
-- Objetivo: Lock distribuído atômico para evitar concorrência em cron jobs

-- Tabela de locks distribuídos
CREATE TABLE IF NOT EXISTS public.distributed_locks (
  name TEXT PRIMARY KEY,
  owner UUID NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Índice para cleanup de locks expirados
CREATE INDEX IF NOT EXISTS idx_distributed_locks_expires_at ON public.distributed_locks(expires_at);

-- Função para adquirir lock
CREATE OR REPLACE FUNCTION public.acquire_download_lock(
  p_name TEXT,
  p_owner UUID,
  p_ttl_seconds INT DEFAULT 180
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expires_at TIMESTAMPTZ;
BEGIN
  v_expires_at := now() + (p_ttl_seconds || ' seconds')::INTERVAL;
  
  -- Tenta inserir novo lock
  INSERT INTO public.distributed_locks (name, owner, acquired_at, expires_at)
  VALUES (p_name, p_owner, now(), v_expires_at)
  ON CONFLICT (name) DO UPDATE
    SET owner = p_owner,
        acquired_at = now(),
        expires_at = v_expires_at
    WHERE distributed_locks.expires_at < now(); -- Só atualiza se expirado
  
  -- Verifica se conseguiu adquirir (owner é o mesmo)
  RETURN EXISTS (
    SELECT 1 FROM public.distributed_locks
    WHERE name = p_name AND owner = p_owner
  );
END;
$$;

-- Função para liberar lock
CREATE OR REPLACE FUNCTION public.release_download_lock(
  p_name TEXT,
  p_owner UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted BOOLEAN;
BEGIN
  -- Deleta lock apenas se o owner bater
  DELETE FROM public.distributed_locks
  WHERE name = p_name AND owner = p_owner;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

-- Comentários
COMMENT ON TABLE public.distributed_locks IS 'Tabela de locks distribuídos para controle de concorrência em jobs automáticos';
COMMENT ON FUNCTION public.acquire_download_lock IS 'Adquire lock atomicamente. Retorna true se conseguiu, false se ocupado por outro owner.';
COMMENT ON FUNCTION public.release_download_lock IS 'Libera lock atomicamente. Retorna true se liberou, false se não era o owner.';

-- Grants (para ser executado no Supabase Dashboard)
-- Grant necessário para service_role poder chamar as funções
GRANT EXECUTE ON FUNCTION public.acquire_download_lock TO service_role;
GRANT EXECUTE ON FUNCTION public.release_download_lock TO service_role;
