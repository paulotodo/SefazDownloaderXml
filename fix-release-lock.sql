-- FIX: Corrige erro de tipo na função release_download_lock
-- Execute este script no Supabase Dashboard > SQL Editor

CREATE OR REPLACE FUNCTION public.release_download_lock(
  p_name TEXT,
  p_owner UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INTEGER;  -- Corrigido: era BOOLEAN, deve ser INTEGER
BEGIN
  -- Deleta lock apenas se o owner bater
  DELETE FROM public.distributed_locks
  WHERE name = p_name AND owner = p_owner;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

-- Verifica se a função está funcionando
SELECT public.release_download_lock('test-lock', gen_random_uuid());
