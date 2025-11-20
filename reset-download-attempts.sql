-- ============================================================
-- RESET: Zerar Tentativas de Download para Nova Rodada
-- Execute no Supabase Production SQL Editor
-- ============================================================

-- Resetar XMLs que são resNFe (resumos) e estão com tentativas esgotadas
-- Isso permite que o sistema tente novamente com a lógica de manifestação corrigida
UPDATE public.xmls 
SET 
  tentativas_download = 0,
  status_download = 'pendente',
  erro_download = NULL,
  ultima_tentativa_download = NULL
WHERE 
  tipo_documento = 'resNFe'
  AND (tentativas_download >= 2 OR status_download = 'erro');

-- Verificar quantos XMLs foram resetados
SELECT 
  COUNT(*) as xmls_resetados,
  COUNT(*) FILTER (WHERE tipo_documento = 'resNFe') as resumos_pendentes
FROM public.xmls
WHERE status_download = 'pendente';
