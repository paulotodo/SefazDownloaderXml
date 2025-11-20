-- ============================================================
-- MIGRAÇÃO COMPLETA: Adicionar 8 Colunas Restantes
-- Execute no Supabase PRODUCTION SQL Editor
-- (status_download já foi criada no teste anterior)
-- ============================================================

-- ADICIONAR COLUNAS DE CONTROLE DE DOWNLOAD
ALTER TABLE public.xmls ADD COLUMN IF NOT EXISTS tentativas_download INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.xmls ADD COLUMN IF NOT EXISTS ultima_tentativa_download TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.xmls ADD COLUMN IF NOT EXISTS erro_download TEXT;

-- ADICIONAR COLUNAS DE CONTROLE DE MANIFESTAÇÃO
ALTER TABLE public.xmls ADD COLUMN IF NOT EXISTS status_manifestacao TEXT NOT NULL DEFAULT 'nao_manifestado';
ALTER TABLE public.xmls ADD COLUMN IF NOT EXISTS tentativas_manifestacao INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.xmls ADD COLUMN IF NOT EXISTS ultima_tentativa_manifestacao TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.xmls ADD COLUMN IF NOT EXISTS erro_manifestacao TEXT;

-- ADICIONAR COLUNA DE STATUS NFE
ALTER TABLE public.xmls ADD COLUMN IF NOT EXISTS status_nfe TEXT NOT NULL DEFAULT 'autorizada';

-- CRIAR ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_xmls_status_download 
ON public.xmls(status_download, tipo_documento) 
WHERE status_download = 'pendente' AND tipo_documento = 'resNFe';

CREATE INDEX IF NOT EXISTS idx_xmls_status_manifestacao 
ON public.xmls(status_manifestacao, tipo_documento) 
WHERE status_manifestacao = 'nao_manifestado' AND tipo_documento = 'resNFe';

-- ATUALIZAR XMLs EXISTENTES
UPDATE public.xmls SET status_download = 'completo' WHERE tipo_documento = 'nfeProc';
UPDATE public.xmls SET status_download = 'pendente' WHERE tipo_documento = 'resNFe';

-- VERIFICAÇÃO FINAL - Execute separadamente para confirmar
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'xmls' AND table_schema = 'public'
-- ORDER BY column_name;
