-- ========================================
-- TESTE: Timezone após reconexão
-- ========================================

-- 1. Confirmar timezone do PostgreSQL
SHOW timezone;

-- 2. Testar NOW() - deve retornar horário de São Paulo
SELECT 
  NOW() AS now_com_timezone,
  CURRENT_TIMESTAMP AS current_timestamp,
  LOCALTIME AS local_time,
  TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS TZ') AS now_formatado,
  EXTRACT(TIMEZONE FROM NOW()) / 3600 AS offset_horas;

-- 3. Testar comparação de bloqueio (simulação)
DO $$
DECLARE
  v_bloqueio_futuro TIMESTAMP WITH TIME ZONE;
  v_bloqueio_passado TIMESTAMP WITH TIME ZONE;
  v_now TIMESTAMP WITH TIME ZONE;
  v_bloqueado_futuro BOOLEAN;
  v_bloqueado_passado BOOLEAN;
BEGIN
  v_now := NOW();
  v_bloqueio_futuro := v_now + INTERVAL '30 minutes';
  v_bloqueio_passado := v_now - INTERVAL '30 minutes';
  
  v_bloqueado_futuro := (v_bloqueio_futuro > v_now);
  v_bloqueado_passado := (v_bloqueio_passado > v_now);
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TESTE: Comparação de Bloqueio';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'NOW():                    %', v_now;
  RAISE NOTICE 'Bloqueio Futuro (+30min): %', v_bloqueio_futuro;
  RAISE NOTICE 'Bloqueio Passado (-30min): %', v_bloqueio_passado;
  RAISE NOTICE 'Está bloqueado (futuro)?  %', v_bloqueado_futuro;
  RAISE NOTICE 'Está bloqueado (passado)? %', v_bloqueado_passado;
  RAISE NOTICE '========================================';
  
  IF v_bloqueado_futuro = TRUE AND v_bloqueado_passado = FALSE THEN
    RAISE NOTICE '✅ OK: Comparações funcionando corretamente!';
  ELSE
    RAISE WARNING '❌ PROBLEMA: Comparações incorretas!';
  END IF;
END $$;

-- 4. Estado atual da empresa
SELECT 
  e.razao_social,
  e.bloqueado_ate,
  NOW() AS agora,
  CASE 
    WHEN e.bloqueado_ate IS NULL THEN '✅ SEM BLOQUEIO'
    WHEN e.bloqueado_ate > NOW() THEN '🔒 BLOQUEADO'
    ELSE '✅ BLOQUEIO EXPIRADO'
  END AS status,
  EXTRACT(EPOCH FROM (e.bloqueado_ate - NOW())) / 60 AS minutos_restantes
FROM empresas e
WHERE e.cnpj = '07082454000440';
