-- ============================================================================
-- Migration: Adicionar Controle de Download Automático de XMLs
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Abra o Supabase Dashboard → SQL Editor
-- 2. Cole este arquivo e execute (clique em "Run")
-- 3. Confirme que não há erros
-- ============================================================================

-- Adicionar campos de controle de download na tabela xmls
ALTER TABLE public.xmls
  ADD COLUMN IF NOT EXISTS status_download text NOT NULL DEFAULT 'pendente';

ALTER TABLE public.xmls
  ADD COLUMN IF NOT EXISTS tentativas_download integer NOT NULL DEFAULT 0;

ALTER TABLE public.xmls
  ADD COLUMN IF NOT EXISTS ultima_tentativa_download timestamptz;

ALTER TABLE public.xmls
  ADD COLUMN IF NOT EXISTS erro_download text;

-- Criar índice para buscar XMLs pendentes de download
CREATE INDEX IF NOT EXISTS idx_xmls_status_download 
  ON public.xmls(status_download, user_id, empresa_id);

-- Criar índice para buscar XMLs que precisam retry
CREATE INDEX IF NOT EXISTS idx_xmls_ultima_tentativa 
  ON public.xmls(ultima_tentativa_download) 
  WHERE status_download = 'erro';

-- ============================================================================
-- VALIDAÇÃO
-- ============================================================================

-- Verificar colunas adicionadas
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_schema='public' 
  AND table_name='xmls' 
  AND column_name IN ('status_download', 'tentativas_download', 'ultima_tentativa_download', 'erro_download')
ORDER BY column_name;

-- Contar XMLs por status de download (deve retornar vazio ou só 'pendente' se já tem dados)
SELECT status_download, COUNT(*) 
FROM public.xmls 
GROUP BY status_download;

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
