-- ========================================
-- CORREÇÃO COMPLETA: Timezone Brasil
-- ========================================

-- PASSO 1: Confirmar timezone do banco
SHOW timezone;

-- PASSO 2: Limpar bloqueio falso atual
UPDATE empresas 
SET bloqueado_ate = NULL 
WHERE cnpj = '07082454000440';

-- PASSO 3: Resetar contador rate limit
DELETE FROM sefaz_rate_limit
WHERE empresa_id IN (SELECT id FROM empresas WHERE cnpj = '07082454000440');

-- PASSO 4: Confirmar limpeza
SELECT 
  e.razao_social,
  e.bloqueado_ate,
  CASE 
    WHEN e.bloqueado_ate IS NULL THEN '✅ DESBLOQUEADO'
    ELSE '🔒 BLOQUEADO'
  END AS status
FROM empresas e
WHERE e.cnpj = '07082454000440';

-- ========================================
-- CORREÇÃO DE SCHEMA (OPCIONAL - RECOMENDADO)
-- ========================================

-- Problema: sefaz_rate_limit usa "timestamp without time zone"
-- Isso causa bugs ao comparar com NOW() que retorna "timestamp with time zone"

-- COMENTÁRIO: Se continuar tendo problemas, execute isto:
-- ALTER TABLE sefaz_rate_limit 
--   ALTER COLUMN janela_inicio TYPE timestamp with time zone USING janela_inicio AT TIME ZONE 'UTC';
-- ALTER TABLE sefaz_rate_limit 
--   ALTER COLUMN created_at TYPE timestamp with time zone USING created_at AT TIME ZONE 'UTC';
-- ALTER TABLE sefaz_rate_limit 
--   ALTER COLUMN updated_at TYPE timestamp with time zone USING updated_at AT TIME ZONE 'UTC';
