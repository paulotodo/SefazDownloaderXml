-- ============================================================
-- MIGRAÇÃO: Adicionar Colunas de Controle na Tabela XMLs
-- Versão 2 - Simplificada (sem BEGIN/COMMIT)
-- ============================================================

-- 1. ADICIONAR COLUNAS DE CONTROLE DE DOWNLOAD
ALTER TABLE xmls ADD COLUMN IF NOT EXISTS status_download TEXT NOT NULL DEFAULT 'pendente';
ALTER TABLE xmls ADD COLUMN IF NOT EXISTS tentativas_download INTEGER NOT NULL DEFAULT 0;
ALTER TABLE xmls ADD COLUMN IF NOT EXISTS ultima_tentativa_download TIMESTAMP WITH TIME ZONE;
ALTER TABLE xmls ADD COLUMN IF NOT EXISTS erro_download TEXT;

-- 2. ADICIONAR COLUNAS DE CONTROLE DE MANIFESTAÇÃO
ALTER TABLE xmls ADD COLUMN IF NOT EXISTS status_manifestacao TEXT NOT NULL DEFAULT 'nao_manifestado';
ALTER TABLE xmls ADD COLUMN IF NOT EXISTS tentativas_manifestacao INTEGER NOT NULL DEFAULT 0;
ALTER TABLE xmls ADD COLUMN IF NOT EXISTS ultima_tentativa_manifestacao TIMESTAMP WITH TIME ZONE;
ALTER TABLE xmls ADD COLUMN IF NOT EXISTS erro_manifestacao TEXT;

-- 3. ADICIONAR COLUNA DE STATUS NFE
ALTER TABLE xmls ADD COLUMN IF NOT EXISTS status_nfe TEXT NOT NULL DEFAULT 'autorizada';

-- 4. CRIAR ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_xmls_status_download 
ON xmls(status_download, tipo_documento) 
WHERE status_download = 'pendente' AND tipo_documento = 'resNFe';

CREATE INDEX IF NOT EXISTS idx_xmls_status_manifestacao 
ON xmls(status_manifestacao, tipo_documento) 
WHERE status_manifestacao = 'nao_manifestado' AND tipo_documento = 'resNFe';

-- 5. ATUALIZAR XMLs EXISTENTES
UPDATE xmls SET status_download = 'completo' WHERE tipo_documento = 'nfeProc' AND status_download = 'pendente';
UPDATE xmls SET status_download = 'pendente' WHERE tipo_documento = 'resNFe';

-- 6. VERIFICAÇÃO - Execute esta query separadamente para confirmar
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'xmls' ORDER BY column_name;
