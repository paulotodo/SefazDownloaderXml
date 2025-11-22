-- ========================================
-- ANÁLISE COMPLETA: Timezone do Banco de Dados
-- ========================================

-- 1. VERIFICAR TIMEZONE DO POSTGRESQL
SHOW timezone;

-- 2. VERIFICAR TIMEZONE ATUAL
SELECT 
  NOW() AS agora_com_tz,
  NOW() AT TIME ZONE 'America/Sao_Paulo' AS agora_sao_paulo,
  NOW() AT TIME ZONE 'UTC' AS agora_utc,
  CURRENT_TIMESTAMP AS current_timestamp,
  EXTRACT(TIMEZONE FROM NOW()) / 3600 AS offset_horas;

-- 3. VERIFICAR TIPOS DE COLUNAS TIMESTAMP
SELECT 
  table_name,
  column_name,
  data_type,
  datetime_precision
FROM information_schema.columns
WHERE table_name IN ('empresas', 'sefaz_rate_limit', 'logs', 'sincronizacoes')
  AND data_type LIKE '%timestamp%'
ORDER BY table_name, column_name;

-- 4. VERIFICAR DADOS ATUAIS COM TIMEZONE
SELECT 
  'empresas.bloqueado_ate' AS campo,
  e.razao_social,
  e.bloqueado_ate AS valor_original,
  e.bloqueado_ate AT TIME ZONE 'UTC' AS valor_utc,
  e.bloqueado_ate AT TIME ZONE 'America/Sao_Paulo' AS valor_sao_paulo,
  NOW() AS now_servidor,
  NOW() AT TIME ZONE 'America/Sao_Paulo' AS now_sao_paulo,
  CASE 
    WHEN e.bloqueado_ate IS NULL THEN 'SEM BLOQUEIO'
    WHEN e.bloqueado_ate > NOW() THEN 'BLOQUEADO (comparando UTC)'
    WHEN e.bloqueado_ate AT TIME ZONE 'America/Sao_Paulo' > NOW() AT TIME ZONE 'America/Sao_Paulo' THEN 'BLOQUEADO (comparando SP)'
    ELSE 'DESBLOQUEADO'
  END AS status_comparacao
FROM empresas e
WHERE e.cnpj = '07082454000440';

-- 5. VERIFICAR SEFAZ_RATE_LIMIT
SELECT 
  'sefaz_rate_limit.janela_inicio' AS campo,
  e.razao_social,
  r.janela_inicio AS valor_original,
  r.janela_inicio AT TIME ZONE 'UTC' AS valor_utc,
  r.janela_inicio AT TIME ZONE 'America/Sao_Paulo' AS valor_sao_paulo,
  (r.janela_inicio + INTERVAL '1 hour') AS reset_original,
  (r.janela_inicio + INTERVAL '1 hour') AT TIME ZONE 'America/Sao_Paulo' AS reset_sao_paulo,
  NOW() AS now_servidor,
  NOW() AT TIME ZONE 'America/Sao_Paulo' AS now_sao_paulo
FROM sefaz_rate_limit r
JOIN empresas e ON e.id = r.empresa_id
WHERE e.cnpj = '07082454000440'
  AND r.tipo_operacao = 'distribuicaoDFe';

-- 6. TESTE: Comparação de Bloqueio
DO $$
DECLARE
  v_bloqueado_ate TIMESTAMP;
  v_now TIMESTAMP;
  v_bloqueado_utc BOOLEAN;
  v_bloqueado_sp BOOLEAN;
BEGIN
  SELECT bloqueado_ate INTO v_bloqueado_ate
  FROM empresas
  WHERE cnpj = '07082454000440';
  
  v_now := NOW();
  
  -- Comparação UTC
  v_bloqueado_utc := (v_bloqueado_ate > v_now);
  
  -- Comparação São Paulo
  v_bloqueado_sp := (
    (v_bloqueado_ate AT TIME ZONE 'America/Sao_Paulo') > 
    (v_now AT TIME ZONE 'America/Sao_Paulo')
  );
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TESTE: Comparação de Bloqueio';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'bloqueado_ate:           %', v_bloqueado_ate;
  RAISE NOTICE 'NOW():                   %', v_now;
  RAISE NOTICE 'Bloqueado (UTC)?         %', v_bloqueado_utc;
  RAISE NOTICE 'Bloqueado (São Paulo)?   %', v_bloqueado_sp;
  RAISE NOTICE '========================================';
  
  IF v_bloqueado_utc != v_bloqueado_sp THEN
    RAISE WARNING '❌ PROBLEMA: Resultados diferentes entre UTC e São Paulo!';
  ELSE
    RAISE NOTICE '✅ OK: Mesma comparação em ambos timezones';
  END IF;
END $$;

-- 7. CONFIGURAR TIMEZONE PARA SÃO PAULO (se necessário)
-- Descomente a linha abaixo se timezone estiver errado:
-- ALTER DATABASE postgres SET timezone TO 'America/Sao_Paulo';
