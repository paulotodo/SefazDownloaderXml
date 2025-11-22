-- ========================================
-- MONITORAMENTO: Rate Limiting Funcionando
-- ========================================
-- Use estas queries para verificar se correção está funcionando

-- 1. CONTADORES ATUAIS (devem estar <= 20)
SELECT 
  e.razao_social,
  r.tipo_operacao,
  r.contador,
  (20 - r.contador) AS consultas_restantes,
  r.janela_inicio AT TIME ZONE 'America/Sao_Paulo' AS inicio_janela_brasilia,
  (r.janela_inicio + INTERVAL '1 hour') AT TIME ZONE 'America/Sao_Paulo' AS reset_janela_brasilia,
  e.bloqueado_ate AT TIME ZONE 'America/Sao_Paulo' AS bloqueio_brasilia,
  CASE 
    WHEN e.bloqueado_ate > NOW() THEN '🔒 BLOQUEADO'
    WHEN r.contador >= 20 THEN '⚠️ NO LIMITE'
    ELSE '✅ LIBERADO'
  END AS status
FROM sefaz_rate_limit r
JOIN empresas e ON e.id = r.empresa_id
WHERE r.tipo_operacao = 'distribuicaoDFe'
ORDER BY r.contador DESC, e.razao_social;

-- 2. VERIFICAR SE HÁ CONTADORES ACIMA DE 20 (NÃO DEVE EXISTIR!)
SELECT 
  COUNT(*) AS total_acima_limite,
  MAX(contador) AS contador_maximo
FROM sefaz_rate_limit
WHERE contador > 20;
-- Esperado: total_acima_limite = 0

-- 3. LOGS RECENTES DE RATE LIMITING
SELECT 
  created_at AT TIME ZONE 'America/Sao_Paulo' AS horario_brasilia,
  e.razao_social,
  l.nivel,
  l.mensagem,
  l.detalhes->>'bloqueadoAte' AS bloqueado_ate_iso,
  l.detalhes->>'proximaConsultaHorarioBrasil' AS proxima_consulta,
  l.detalhes->>'motivo' AS motivo
FROM logs l
JOIN empresas e ON e.id = l.empresa_id
WHERE l.mensagem LIKE '%Rate limit%'
  OR l.mensagem LIKE '%Bloqueado%'
ORDER BY l.created_at DESC
LIMIT 10;

-- 4. HISTÓRICO DE SINCRONIZAÇÕES (última hora)
SELECT 
  created_at AT TIME ZONE 'America/Sao_Paulo' AS horario_brasilia,
  e.razao_social,
  s.status,
  s.xmls_encontrados,
  s.xmls_baixados,
  s.mensagem_erro
FROM sincronizacoes s
JOIN empresas e ON e.id = s.empresa_id
WHERE s.created_at > NOW() - INTERVAL '1 hour'
ORDER BY s.created_at DESC
LIMIT 10;

-- 5. EMPRESAS BLOQUEADAS NO MOMENTO
SELECT 
  e.razao_social,
  e.cnpj,
  e.bloqueado_ate AT TIME ZONE 'America/Sao_Paulo' AS bloqueio_ate_brasilia,
  EXTRACT(EPOCH FROM (e.bloqueado_ate - NOW())) / 60 AS minutos_restantes,
  r.contador AS consultas_realizadas
FROM empresas e
LEFT JOIN sefaz_rate_limit r ON r.empresa_id = e.id AND r.tipo_operacao = 'distribuicaoDFe'
WHERE e.bloqueado_ate > NOW()
ORDER BY e.bloqueado_ate;

-- 6. TESTE: Simular Verificação de Rate Limit (NÃO incrementa)
-- Execute múltiplas vezes - contador NÃO deve subir se já está em 20
DO $$
DECLARE
  v_pode_consultar BOOLEAN;
  v_contador_antes INTEGER;
  v_contador_depois INTEGER;
  v_user_id UUID;
  v_empresa_id UUID;
BEGIN
  -- Pega primeira empresa
  SELECT user_id, id INTO v_user_id, v_empresa_id
  FROM empresas
  LIMIT 1;
  
  -- Verifica contador antes
  SELECT contador INTO v_contador_antes
  FROM sefaz_rate_limit
  WHERE empresa_id = v_empresa_id AND tipo_operacao = 'distribuicaoDFe';
  
  -- Testa RPC
  v_pode_consultar := increment_and_check_rate_limit(
    v_user_id, 
    v_empresa_id, 
    'distribuicaoDFe', 
    20
  );
  
  -- Verifica contador depois
  SELECT contador INTO v_contador_depois
  FROM sefaz_rate_limit
  WHERE empresa_id = v_empresa_id AND tipo_operacao = 'distribuicaoDFe';
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TESTE: increment_and_check_rate_limit';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Contador ANTES:  %', COALESCE(v_contador_antes, 0);
  RAISE NOTICE 'Pode consultar:  %', v_pode_consultar;
  RAISE NOTICE 'Contador DEPOIS: %', COALESCE(v_contador_depois, 0);
  
  IF v_contador_antes >= 20 AND v_contador_depois > v_contador_antes THEN
    RAISE WARNING '❌ BUG: Incrementou mesmo estando no limite!';
  ELSIF v_contador_antes >= 20 AND v_contador_depois = v_contador_antes THEN
    RAISE NOTICE '✅ CORRETO: NÃO incrementou quando já no limite';
  ELSIF v_contador_antes < 20 AND v_contador_depois = v_contador_antes + 1 THEN
    RAISE NOTICE '✅ CORRETO: Incrementou corretamente (abaixo do limite)';
  END IF;
  
  RAISE NOTICE '========================================';
END $$;
