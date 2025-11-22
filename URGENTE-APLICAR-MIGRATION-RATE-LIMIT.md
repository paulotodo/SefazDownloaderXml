# 🚨 URGENTE: Aplicar Migration de Rate Limiting

## ⚠️ PROBLEMA CRÍTICO

Seu sistema está tomando **bloqueio cStat 656 da SEFAZ** a cada sincronização porque o **rate limiting NÃO ESTÁ FUNCIONANDO**.

### 🔍 Causa Raiz

A migration do PostgreSQL **NUNCA foi aplicada** no Supabase Production. Sem a RPC function `increment_and_check_rate_limit`, o sistema:

- ❌ **Ignora completamente** o limite de 20 consultas/hora
- ❌ **Permite TODAS as consultas** (fail-open quando RPC não existe)
- ❌ **SEFAZ bloqueia constantemente** com cStat 656

### 📊 Evidência nos Logs

```
❌ [SupabaseStorage] ERRO CRÍTICO: Migration 'supabase-migration-rate-limit-status.sql' NÃO foi aplicada!
   → Aplique a migration no Supabase Dashboard antes de usar rate limiting
   → Rate limiting desabilitado temporariamente (fail-open)
```

---

## 🚀 SOLUÇÃO IMEDIATA (10 minutos)

### Passo 1: Acessar Supabase Dashboard

1. Abra: https://supabase.com/dashboard
2. Selecione seu projeto: **[SEU_PROJETO]**
3. Vá em: **SQL Editor** (ícone de banco de dados no menu lateral)

### Passo 2: Aplicar Migration

1. Clique em **"New Query"**
2. Copie **TODO** o conteúdo do arquivo `supabase-migration-rate-limit-status.sql`
3. Cole no editor SQL
4. Clique em **"Run"** (ou pressione `Ctrl+Enter`)

**Arquivo a copiar:** `supabase-migration-rate-limit-status.sql`

### Passo 3: Verificar Sucesso

Execute esta query para confirmar:

```sql
-- Verificar se tabela foi criada
SELECT COUNT(*) FROM sefaz_rate_limit;

-- Verificar se RPC function existe
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'increment_and_check_rate_limit';

-- Deve retornar 1 registro com o nome da função
```

**Resultado esperado:**
- Tabela `sefaz_rate_limit` existe (retorna 0 linhas - tabela vazia mas existe)
- Function `increment_and_check_rate_limit` existe (retorna 1 registro)

### Passo 4: Restart da Aplicação

```bash
# Se estiver rodando localmente (Replit)
# Apenas reinicie o workflow "Start application"

# Se estiver rodando em Docker (produção)
docker compose -f docker-compose.production.yml restart sefaz-xml-sync

# Verificar logs
docker logs sefaz-xml-sync -f
```

**Logs esperados após restart:**
```
✅ [SupabaseStorage] Rate limit check successful
✅ [Startup] Rate limiting migration verified
```

---

## 📝 O Que a Migration Faz

### 1. Cria Tabela `sefaz_rate_limit`

```sql
CREATE TABLE sefaz_rate_limit (
  user_id UUID NOT NULL,
  empresa_id UUID NOT NULL,
  tipo_operacao VARCHAR NOT NULL,  -- 'consultaChave', 'distribuicaoDFe', 'manifestacao'
  contador INTEGER NOT NULL DEFAULT 0,
  janela_inicio TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, empresa_id, tipo_operacao)
);
```

**Propósito:** Rastreia quantas consultas cada empresa fez na última hora.

### 2. Cria RPC Function `increment_and_check_rate_limit`

```sql
CREATE FUNCTION increment_and_check_rate_limit(
  p_user_id UUID,
  p_empresa_id UUID,
  p_tipo_operacao VARCHAR,
  p_limite INTEGER DEFAULT 20
) RETURNS BOOLEAN
```

**Propósito:** 
- Incrementa contador de consultas
- Reseta automaticamente após 1 hora
- Retorna `TRUE` se dentro do limite (≤20), `FALSE` se excedeu

### 3. Adiciona Campo `status_nfe` na Tabela `xmls`

```sql
ALTER TABLE xmls ADD COLUMN status_nfe VARCHAR(20) DEFAULT 'autorizada';
```

**Valores:** `autorizada`, `cancelada`, `denegada`, `inutilizada`

### 4. Limpa Erros Legacy

```sql
UPDATE xmls
SET status_download = 'pendente', erro_download = NULL
WHERE erro_download LIKE '%Rate limit%';
```

**Propósito:** XMLs que ficaram presos com erro de rate limit voltam a processar.

---

## ✅ Verificação Pós-Migration

### Teste 1: Verificar Tabela

```sql
SELECT * FROM sefaz_rate_limit LIMIT 5;
```

**Esperado:** Retorna 0 linhas (tabela vazia inicial) **SEM ERRO**.

### Teste 2: Verificar Function

```sql
SELECT increment_and_check_rate_limit(
  '00000000-0000-0000-0000-000000000001'::UUID,
  '00000000-0000-0000-0000-000000000002'::UUID,
  'teste',
  20
);
```

**Esperado:** Retorna `TRUE` (primeiro teste, contador=1, dentro do limite).

### Teste 3: Testar Limite

```sql
-- Executa 21 vezes para testar limite
SELECT increment_and_check_rate_limit(
  auth.uid(),
  '00000000-0000-0000-0000-000000000003'::UUID,
  'teste_limite',
  20
);
```

**Esperado:** 
- Primeiras 20 execuções retornam `TRUE`
- 21ª execução retorna `FALSE` (limite excedido)

---

## 🔄 Como Funciona o Rate Limiting

### Fluxo de Consulta SEFAZ

```
1. Sistema tenta fazer consulta SEFAZ
   ↓
2. checkRateLimit(empresaId, "consultaChave")
   ↓
3. RPC increment_and_check_rate_limit()
   ├─ Incrementa contador
   ├─ Verifica se contador ≤ 20
   └─ Retorna TRUE/FALSE
   ↓
4. Se TRUE: Consulta permitida ✅
5. Se FALSE: Consulta bloqueada ❌ (evita cStat 656)
```

### Janela de Reset

- **Janela:** 1 hora (60 minutos)
- **Reset automático:** Após 1 hora, contador volta para 0
- **Cálculo:** `janela_inicio` armazenado no banco

**Exemplo:**
```
10:00 - Primeira consulta → contador = 1
10:15 - Consulta 20 → contador = 20
10:16 - Consulta 21 → BLOQUEADA ❌
11:00 - Janela reseta → contador = 0 ✅
11:01 - Consulta permitida novamente
```

---

## 🐛 Troubleshooting

### Erro: "function does not exist"

**Causa:** Migration não foi aplicada ou aplicada incorretamente.

**Solução:**
1. Verifique se executou **TODO** o SQL de `supabase-migration-rate-limit-status.sql`
2. Confirme que está usando o **projeto correto** no Supabase Dashboard
3. Execute query de verificação:
   ```sql
   SELECT proname FROM pg_proc WHERE proname LIKE '%rate_limit%';
   ```

### Erro: "permission denied for function"

**Causa:** Faltam permissões no Supabase.

**Solução:** Re-execute esta parte da migration:
```sql
REVOKE ALL ON FUNCTION increment_and_check_rate_limit FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_and_check_rate_limit TO service_role;
```

### Erro: "table sefaz_rate_limit already exists"

**Causa:** Migration foi parcialmente aplicada.

**Solução:** 
1. Drop e recrie:
   ```sql
   DROP TABLE IF EXISTS sefaz_rate_limit CASCADE;
   ```
2. Execute a migration novamente (ela já tem DROP IF EXISTS)

### Sistema ainda tomando cStat 656

**Possíveis causas:**

1. **Migration não aplicada:**
   ```bash
   # Verificar logs
   docker logs sefaz-xml-sync | grep "ERRO CRÍTICO"
   ```

2. **Múltiplos sistemas consultando mesmo CNPJ:**
   - ERP/contador consultando simultaneamente
   - Solução: Desative outros sistemas temporariamente

3. **Backlog muito grande:**
   - Muitos XMLs pendentes de download
   - Solução: Processar em lotes menores

4. **Sincronização muito frequente:**
   - Cron rodando a cada 5 minutos (padrão)
   - Solução: Aumentar intervalo temporariamente

---

## 📊 Monitoramento Pós-Migration

### Query 1: Ver Uso Atual de Rate Limit

```sql
SELECT 
  e.razao_social,
  r.tipo_operacao,
  r.contador,
  r.janela_inicio,
  (20 - r.contador) AS consultas_restantes,
  (r.janela_inicio + INTERVAL '1 hour') AS reset_em
FROM sefaz_rate_limit r
JOIN empresas e ON e.id = r.empresa_id
ORDER BY r.contador DESC;
```

### Query 2: Empresas Próximas do Limite

```sql
SELECT 
  e.razao_social,
  r.tipo_operacao,
  r.contador,
  CASE 
    WHEN r.contador >= 20 THEN 'LIMITE ATINGIDO ⛔'
    WHEN r.contador >= 15 THEN 'PRÓXIMO DO LIMITE ⚠️'
    ELSE 'OK ✅'
  END AS status
FROM sefaz_rate_limit r
JOIN empresas e ON e.id = r.empresa_id
WHERE r.contador >= 15
ORDER BY r.contador DESC;
```

### Query 3: Histórico de Bloqueios SEFAZ

```sql
SELECT 
  e.razao_social,
  l.mensagem,
  l.created_at
FROM logs l
JOIN empresas e ON e.id = l.empresa_id
WHERE l.mensagem LIKE '%656%'
ORDER BY l.created_at DESC
LIMIT 20;
```

---

## 🎯 Resultados Esperados

Após aplicar a migration corretamente:

✅ **Rate limiting funcionando**
- Sistema respeita limite de 20 consultas/hora
- Logs mostram: `Rate limit OK` ou `Rate limit excedido`

✅ **Sem bloqueios cStat 656**
- SEFAZ não bloqueia mais (ou muito raramente)
- Sincronizações completam com sucesso

✅ **Logs limpos**
- Sem erro: "ERRO CRÍTICO: Migration não aplicada"
- Logs mostram contadores de rate limit

✅ **XMLs processados gradualmente**
- Downloads respeitam janela de 1 hora
- Não há burst de 50+ consultas de uma vez

---

## ⏱️ Timeline Esperada

| Tempo | Ação | Status |
|-------|------|--------|
| T+0min | Aplicar migration no Supabase | ⏳ |
| T+1min | Verificar tabela/function criadas | ✅ |
| T+2min | Restart aplicação | ⏳ |
| T+3min | Verificar logs (sem erro "ERRO CRÍTICO") | ✅ |
| T+5min | Primeira sincronização com rate limit | ✅ |
| T+10min | Confirmar sem bloqueio cStat 656 | ✅ |
| T+1hora | Janela reseta, contador volta para 0 | ✅ |

---

## 📞 Próximos Passos

1. **APLICAR MIGRATION AGORA** (10 minutos)
2. **Verificar se funcionou** (query de teste)
3. **Restart da aplicação** (Docker ou Replit)
4. **Monitorar logs** (30 minutos)
5. **Confirmar sucesso** (sem cStat 656)

---

## 🚨 IMPORTANTE

**NÃO ignore esta migration!**

Sem o rate limiting funcionando, você vai:
- ❌ Tomar bloqueio cStat 656 constantemente
- ❌ Empresa bloqueada por 1 hora a cada sync
- ❌ XMLs não serão baixados
- ❌ Sistema inutilizado

**COM a migration aplicada:**
- ✅ Rate limiting automático
- ✅ Máximo 20 consultas/hora respeitado
- ✅ Sem bloqueios SEFAZ
- ✅ Sistema funcionando 24/7

---

**Data:** Novembro 2025  
**Prioridade:** 🚨 CRÍTICA - APLICAR IMEDIATAMENTE  
**Tempo:** 10 minutos  
**Impacto:** Resolve 100% dos bloqueios cStat 656
