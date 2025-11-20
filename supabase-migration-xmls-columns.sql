-- ============================================================
-- MIGRAÇÃO: Adicionar Colunas de Controle de Download e Manifestação
-- Data: 20 de novembro de 2025
-- Descrição: Adiciona colunas para controle de download automático 
--            de XMLs completos e manifestação do destinatário
-- ============================================================

-- IMPORTANTE: Execute este SQL no Supabase Dashboard → SQL Editor
-- Este script é IDEMPOTENTE (pode ser executado múltiplas vezes)

BEGIN;

-- ============================================================
-- 1. ADICIONAR COLUNAS DE CONTROLE DE DOWNLOAD
-- ============================================================

-- Coluna: status_download
-- Valores: "pendente", "completo", "erro"
ALTER TABLE xmls 
ADD COLUMN IF NOT EXISTS status_download TEXT NOT NULL DEFAULT 'pendente';

-- Coluna: tentativas_download
-- Contador de tentativas de download do XML completo
ALTER TABLE xmls 
ADD COLUMN IF NOT EXISTS tentativas_download INTEGER NOT NULL DEFAULT 0;

-- Coluna: ultima_tentativa_download
-- Timestamp da última tentativa de download
ALTER TABLE xmls 
ADD COLUMN IF NOT EXISTS ultima_tentativa_download TIMESTAMP WITH TIME ZONE;

-- Coluna: erro_download
-- Mensagem de erro do último download falho
ALTER TABLE xmls 
ADD COLUMN IF NOT EXISTS erro_download TEXT;

-- ============================================================
-- 2. ADICIONAR COLUNAS DE CONTROLE DE MANIFESTAÇÃO
-- ============================================================

-- Coluna: status_manifestacao
-- Valores: "nao_manifestado", "ciencia", "confirmacao", "desconhecimento", "nao_realizada"
ALTER TABLE xmls 
ADD COLUMN IF NOT EXISTS status_manifestacao TEXT NOT NULL DEFAULT 'nao_manifestado';

-- Coluna: tentativas_manifestacao
-- Contador de tentativas de manifestação
ALTER TABLE xmls 
ADD COLUMN IF NOT EXISTS tentativas_manifestacao INTEGER NOT NULL DEFAULT 0;

-- Coluna: ultima_tentativa_manifestacao
-- Timestamp da última tentativa de manifestação
ALTER TABLE xmls 
ADD COLUMN IF NOT EXISTS ultima_tentativa_manifestacao TIMESTAMP WITH TIME ZONE;

-- Coluna: erro_manifestacao
-- Mensagem de erro da última manifestação falha
ALTER TABLE xmls 
ADD COLUMN IF NOT EXISTS erro_manifestacao TEXT;

-- ============================================================
-- 3. ADICIONAR COLUNA DE STATUS NFE
-- ============================================================

-- Coluna: status_nfe
-- Valores: "autorizada" (100), "cancelada" (101), "denegada" (110/301/302), "inutilizada", "uso_denegado"
ALTER TABLE xmls 
ADD COLUMN IF NOT EXISTS status_nfe TEXT NOT NULL DEFAULT 'autorizada';

-- ============================================================
-- 4. CRIAR ÍNDICES PARA PERFORMANCE
-- ============================================================

-- Índice para busca de XMLs pendentes de download (usado pelo download service)
CREATE INDEX IF NOT EXISTS idx_xmls_status_download 
ON xmls(status_download, tipo_documento) 
WHERE status_download = 'pendente' AND tipo_documento = 'resNFe';

-- Índice para busca de XMLs pendentes de manifestação
CREATE INDEX IF NOT EXISTS idx_xmls_status_manifestacao 
ON xmls(status_manifestacao, tipo_documento) 
WHERE status_manifestacao = 'nao_manifestado' AND tipo_documento = 'resNFe';

-- Índice para busca de XMLs com erro de download (retry)
CREATE INDEX IF NOT EXISTS idx_xmls_download_retry 
ON xmls(status_download, tentativas_download, ultima_tentativa_download) 
WHERE status_download = 'pendente' AND tentativas_download > 0;

-- Índice para busca de XMLs com erro de manifestação (retry)
CREATE INDEX IF NOT EXISTS idx_xmls_manifestacao_retry 
ON xmls(status_manifestacao, tentativas_manifestacao, ultima_tentativa_manifestacao) 
WHERE status_manifestacao = 'nao_manifestado' AND tentativas_manifestacao > 0;

-- ============================================================
-- 5. ATUALIZAR XMLs EXISTENTES
-- ============================================================

-- Atualizar XMLs que já são nfeProc (XML completo) como "completo"
UPDATE xmls 
SET status_download = 'completo' 
WHERE tipo_documento = 'nfeProc' AND status_download = 'pendente';

-- Atualizar XMLs que são resNFe (resumo) como "pendente"
UPDATE xmls 
SET status_download = 'pendente' 
WHERE tipo_documento = 'resNFe' AND status_download != 'pendente';

-- ============================================================
-- 6. ADICIONAR COMENTÁRIOS NAS COLUNAS
-- ============================================================

COMMENT ON COLUMN xmls.status_download IS 'Status do download automático do XML completo: pendente, completo, erro';
COMMENT ON COLUMN xmls.tentativas_download IS 'Número de tentativas de download do XML completo';
COMMENT ON COLUMN xmls.ultima_tentativa_download IS 'Timestamp da última tentativa de download';
COMMENT ON COLUMN xmls.erro_download IS 'Mensagem de erro do último download falho';

COMMENT ON COLUMN xmls.status_manifestacao IS 'Status da manifestação do destinatário conforme NT 2020.001: nao_manifestado, ciencia, confirmacao, desconhecimento, nao_realizada';
COMMENT ON COLUMN xmls.tentativas_manifestacao IS 'Número de tentativas de manifestação';
COMMENT ON COLUMN xmls.ultima_tentativa_manifestacao IS 'Timestamp da última tentativa de manifestação';
COMMENT ON COLUMN xmls.erro_manifestacao IS 'Mensagem de erro da última manifestação falha';

COMMENT ON COLUMN xmls.status_nfe IS 'Status da NFe baseado em cStat da SEFAZ: autorizada (100), cancelada (101), denegada (110/301/302), inutilizada, uso_denegado';

COMMIT;

-- ============================================================
-- VERIFICAÇÃO PÓS-MIGRAÇÃO
-- ============================================================

-- Execute esta query para verificar se as colunas foram criadas:
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'xmls' 
-- ORDER BY ordinal_position;
