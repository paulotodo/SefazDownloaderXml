-- ============================================================
-- TESTE: Adicionar apenas UMA coluna para debug
-- ============================================================

-- Tentar adicionar a primeira coluna
ALTER TABLE public.xmls 
ADD COLUMN IF NOT EXISTS status_download TEXT NOT NULL DEFAULT 'pendente';

-- Verificar se foi criada
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_schema = 'public'
  AND table_name = 'xmls' 
  AND column_name = 'status_download';
