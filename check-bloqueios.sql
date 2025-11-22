-- ========================================
-- VERIFICAR BLOQUEIOS E RATE LIMITING
-- ========================================

-- 1. EMPRESAS BLOQUEADAS ATUALMENTE
SELECT 
  id,
  razao_social,
  cnpj,
  bloqueado_ate,
  ultimo_nsu,
  CASE 
    WHEN bloqueado_ate > NOW() THEN '🔴 BLOQUEADO'
    ELSE '✅ ATIVO'
  END AS status,
  CASE 
    WHEN bloqueado_ate > NOW() THEN 
      ROUND(EXTRACT(EPOCH FROM (bloqueado_ate - NOW())) / 60)
    ELSE 0
  END AS minutos_restantes,
  bloqueado_ate::timestamp AT TIME ZONE 'America/Sao_Paulo' AS bloqueio_brasilia
FROM empresas
WHERE ativo = true
ORDER BY bloqueado_ate DESC NULLS LAST;

-- 2. CONTADORES DE RATE LIMIT ATUAIS
SELECT 
  e.razao_social,
  r.tipo_operacao,
  r.contador,
  (20 - r.contador) AS consultas_restantes,
  r.janela_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo' AS inicio_janela_brasilia,
  (r.janela_inicio + INTERVAL '1 hour')::timestamp AT TIME ZONE 'America/Sao_Paulo' AS reset_em_brasilia,
  CASE 
    WHEN (r.janela_inicio + INTERVAL '1 hour') > NOW() THEN '⏳ AGUARDANDO RESET'
    ELSE '✅ JANELA RESETADA'
  END AS status_janela
FROM sefaz_rate_limit r
JOIN empresas e ON e.id = r.empresa_id
ORDER BY r.contador DESC, e.razao_social;

-- 3. ÚLTIMOS LOGS DE SINCRONIZAÇÃO (últimas 24h)
SELECT 
  l.created_at::timestamp AT TIME ZONE 'America/Sao_Paulo' AS horario_brasilia,
  e.razao_social,
  l.nivel,
  l.mensagem,
  l.detalhes::json->>'cStat' AS cstat,
  l.detalhes::json->>'xMotivo' AS motivo,
  l.detalhes::json->>'ultNSU' AS nsu
FROM logs l
JOIN empresas e ON e.id = l.empresa_id
WHERE l.created_at > NOW() - INTERVAL '24 hours'
  AND (
    l.mensagem LIKE '%cStat%656%' 
    OR l.mensagem LIKE '%bloqueado%'
    OR l.mensagem LIKE '%Rate limit%'
    OR l.mensagem LIKE '%Sincronização%'
  )
ORDER BY l.created_at DESC
LIMIT 50;

-- 4. HISTÓRICO DE SINCRONIZAÇÕES (últimas 10)
SELECT 
  s.created_at::timestamp AT TIME ZONE 'America/Sao_Paulo' AS inicio_brasilia,
  s.data_fim::timestamp AT TIME ZONE 'America/Sao_Paulo' AS fim_brasilia,
  e.razao_social,
  s.status,
  s.nsu_inicial,
  s.nsu_final,
  s.xmls_baixados,
  s.mensagem_erro
FROM sincronizacoes s
JOIN empresas e ON e.id = s.empresa_id
ORDER BY s.created_at DESC
LIMIT 10;

-- 5. VERIFICAR SE FUNÇÃO RPC EXISTE
SELECT EXISTS (
  SELECT 1 
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'increment_and_check_rate_limit'
) AS rpc_exists;
