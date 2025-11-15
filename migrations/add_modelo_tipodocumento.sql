-- Migração: Adicionar suporte para NFC-e (modelo 65) e schemas adicionais
-- Data: 15/11/2025
-- Conformidade: MOC 7.0 §2.2 e NT 2014.002 §3.3

-- Adicionar coluna modelo (55=NF-e, 65=NFC-e)
ALTER TABLE xmls 
ADD COLUMN IF NOT EXISTS modelo TEXT NOT NULL DEFAULT '55';

-- Adicionar coluna tipo_documento (nfeProc, resNFe, procEventoNFe, resEvento)
ALTER TABLE xmls 
ADD COLUMN IF NOT EXISTS tipo_documento TEXT NOT NULL DEFAULT 'nfeProc';

-- Comentários para documentação
COMMENT ON COLUMN xmls.modelo IS 'Modelo do documento fiscal: 55 (NF-e) ou 65 (NFC-e) - MOC 7.0 §2.2';
COMMENT ON COLUMN xmls.tipo_documento IS 'Schema do documento: nfeProc, resNFe, procEventoNFe, resEvento - NT 2014.002 §3.3';

-- Criar índices para melhorar consultas
CREATE INDEX IF NOT EXISTS idx_xmls_modelo ON xmls(modelo);
CREATE INDEX IF NOT EXISTS idx_xmls_tipo_documento ON xmls(tipo_documento);

-- Mensagem de sucesso
SELECT 'Migração concluída com sucesso! Suporte para NFC-e (modelo 65) e schemas adicionais ativado.' as status;
