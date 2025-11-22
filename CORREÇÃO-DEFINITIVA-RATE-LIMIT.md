# ✅ CORREÇÃO DEFINITIVA: Rate Limiting cStat 656

**Data:** 22 de Novembro de 2025  
**Status:** ✅ **CORREÇÃO COMPLETA - REQUER AÇÃO**

---

## 🎯 PROBLEMA IDENTIFICADO PELO ARCHITECT

Você estava certo sobre a **função RPC existir**! Mas havia **2 BUGS CRÍTICOS**:

### ❌ BUG 1: RPC Incrementava MESMO Retornando FALSE

**Problema:**
```typescript
// RPC com bug (versão antiga):
INSERT ... ON CONFLICT DO UPDATE SET contador = contador + 1  // ← Sempre incrementa!
RETURNING contador;
return (contador <= 20);  // Retorna true/false DEPOIS de incrementar

// Resultado:
Consulta 20: contador = 20 → TRUE ✅
Consulta 21: contador = 21 → FALSE ❌ (mas já incrementou!)
Consulta 22: contador = 22 → FALSE ❌ (incrementa de novo!)
Consulta 23: contador = 23 → FALSE ❌ (incrementa de novo!)
```

**Consequência:**  
Contador subia para 21, 22, 23... e nunca resetava corretamente.

### ❌ BUG 2: Não Persistia Bloqueio no Banco

**Problema:**
```typescript
// Código com bug (versão antiga):
if (!podeConsultar) {
  break;  // ← Apenas para o loop, NÃO bloqueia no banco!
}

// Resultado:
10:00 - Atinge rate limit → break (para loop)
10:05 - Cron automático tenta de novo → incrementa contador
10:10 - Cron tenta de novo → incrementa contador
```

**Consequência:**  
Sistema tentava sincronizar a cada 5-10 minutos, incrementando contador sem parar.

---

## ✅ CORREÇÃO APLICADA

### 1️⃣ SQL: RPC Corrigida (REQUER APLICAR NO SUPABASE)

**Arquivo:** `supabase-migration-fix-rate-limit-increment.sql`

```sql
-- Verifica ANTES de incrementar
SELECT contador INTO v_contador FROM sefaz_rate_limit WHERE ...;

-- Se não existe, cria com contador = 1
IF v_contador IS NULL THEN
  INSERT ... contador = 1;
  RETURN TRUE;
END IF;

-- Se já está no limite, retorna FALSE SEM incrementar
IF v_contador >= p_limite THEN
  RETURN FALSE;  -- ← NÃO incrementa!
END IF;

-- Só incrementa se está abaixo do limite
UPDATE sefaz_rate_limit SET contador = contador + 1;
RETURN TRUE;
```

### 2️⃣ TypeScript: Persistir Bloqueio (JÁ APLICADO)

**Código corrigido:**
```typescript
if (!podeConsultar) {
  // NOVO: Persiste bloqueio de 65min
  const bloqueadoAte = criarBloqueio(65);
  await storage.updateEmpresa(empresa.id, { bloqueadoAte }, empresa.userId);
  
  // Log com horário de desbloqueio
  await storage.createLog({
    mensagem: `Rate limit atingido - Bloqueado até ${horarioBrasil}`,
    detalhes: { 
      bloqueadoAte, 
      acaoAutomatica: "Sistema bloqueado por 65min" 
    }
  });
  
  break;
}
```

**Locais corrigidos:**
- ✅ `sincronizarEmpresa()` - linha 1789
- ✅ `reconciliarUltimoNSU()` - linha 2256
- ✅ `buscarPorPeriodo()` - linha 2590

---

## 🚀 AÇÃO NECESSÁRIA: APLICAR MIGRATION SQL

### Passo 1: Abrir Supabase Dashboard

1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto
3. Menu lateral → **SQL Editor**

### Passo 2: Executar Migration

1. Copie **TODO** o conteúdo de: `supabase-migration-fix-rate-limit-increment.sql`
2. Cole no SQL Editor
3. Clique em **RUN** (ou pressione Ctrl+Enter)

**Você deve ver:**
```
✅ Fix aplicado: increment_and_check_rate_limit corrigido
   - Agora verifica ANTES de incrementar
   - Não incrementa quando já no limite
   - Contadores > 20 foram resetados para 20
```

### Passo 3: Verificar Sucesso

Execute no SQL Editor:
```sql
-- Verificar se função foi atualizada
SELECT routine_name, routine_definition 
FROM information_schema.routines 
WHERE routine_name = 'increment_and_check_rate_limit';

-- Verificar contadores (devem estar <= 20)
SELECT * FROM sefaz_rate_limit;
```

---

## 📊 COMPORTAMENTO APÓS CORREÇÃO

### ✅ Cenário Correto

```
10:00 - Sincronização inicia (contador = 0)
  ├─ Consulta 1:  RPC verifica (0 < 20) → incrementa → TRUE ✅
  ├─ Consulta 2:  RPC verifica (1 < 20) → incrementa → TRUE ✅
  ├─ ...
  ├─ Consulta 20: RPC verifica (19 < 20) → incrementa → TRUE ✅
  ├─ Consulta 21: RPC verifica (20 >= 20) → NÃO incrementa → FALSE ❌
  └─ Sistema seta bloqueadoAte = 10:00 + 65min = 11:05

10:05 - Cron automático verifica:
  └─ Empresa bloqueada até 11:05 → PULA (não tenta sincronizar)

11:05 - Bloqueio expira
  └─ Janela de 1h resetou → contador volta para 0

11:06 - Próximo cron sincroniza:
  ├─ Empresa desbloqueada ✅
  ├─ Contador resetado (0) ✅
  └─ Sincronização retoma do NSU onde parou ✅
```

---

## 🧪 TESTE COMPLETO

### 1. Aplicar Migration SQL (Supabase Dashboard)

Executar: `supabase-migration-fix-rate-limit-increment.sql`

### 2. Restart Aplicação (Replit)

**Já feito!** ✅ Workflow reiniciado com código corrigido.

### 3. Trigger Sincronização Manual

**Via Interface:**
```
1. Abrir: http://localhost:5000 (ou seu domínio)
2. Ir em "Empresas"
3. Clicar "Sincronizar" em uma empresa
```

**Via API:**
```bash
curl -X POST http://localhost:5000/api/empresas/{EMPRESA_ID}/sincronizar \
  -H "Authorization: Bearer {TOKEN}"
```

### 4. Monitorar Logs

**Query 1: Ver Contador Rate Limit**
```sql
SELECT 
  e.razao_social,
  r.contador,
  (20 - r.contador) AS consultas_restantes,
  r.janela_inicio AT TIME ZONE 'America/Sao_Paulo' AS inicio_brasilia,
  e.bloqueado_ate AT TIME ZONE 'America/Sao_Paulo' AS bloqueio_brasilia
FROM sefaz_rate_limit r
JOIN empresas e ON e.id = r.empresa_id
WHERE r.tipo_operacao = 'distribuicaoDFe';
```

**Esperado:**
```
razao_social    | contador | consultas_restantes | bloqueio_brasilia
----------------|----------|---------------------|-------------------
Empresa Teste   | 20       | 0                   | 2025-11-22 11:05:00
```

**Query 2: Logs Recentes**
```sql
SELECT 
  created_at AT TIME ZONE 'America/Sao_Paulo' AS horario,
  mensagem,
  detalhes->>'proximaConsultaHorarioBrasil' AS proximo_horario
FROM logs
WHERE mensagem LIKE '%Rate limit%'
ORDER BY created_at DESC
LIMIT 5;
```

**Esperado:**
```
horario              | mensagem
---------------------|-----------------------------------------------
2025-11-22 10:00:00  | Rate limit atingido - Bloqueado até 22/11/2025 11:05:00
```

---

## ❌ SE AINDA BLOQUEAR (Troubleshooting)

### Diagnóstico 1: Migration SQL NÃO Foi Aplicada

**Sintoma:** Contador ainda sobe acima de 20

**Verificar:**
```sql
SELECT contador FROM sefaz_rate_limit WHERE contador > 20;
-- Se retornar linhas → migration NÃO foi aplicada
```

**Solução:** Aplicar `supabase-migration-fix-rate-limit-increment.sql` no Supabase

### Diagnóstico 2: Restart NÃO Foi Feito

**Sintoma:** Logs não mostram `bloqueadoAte`

**Solução:**
```bash
# Replit: Restart workflow "Start application"
# Docker: docker compose restart sefaz-xml-sync
```

### Diagnóstico 3: Concorrência Externa

**Sintoma:** cStat 656 mesmo com contador < 20

**Causa:** Outro sistema (ERP, contador) consultando o mesmo CNPJ

**Solução:** Desativar temporariamente outros sistemas

---

## 📋 CHECKLIST DE VERIFICAÇÃO

- [ ] Migration SQL aplicada no Supabase Dashboard
- [ ] Função `increment_and_check_rate_limit` atualizada
- [ ] Contadores > 20 resetados para 20
- [ ] Aplicação reiniciada (workflow restart)
- [ ] Sincronização manual testada
- [ ] Logs mostram `bloqueadoAte` quando rate limit atinge
- [ ] Contador NÃO sobe acima de 20
- [ ] Sistema aguarda 65min antes de retry
- [ ] Após 1h, janela reseta e sincronização retoma

---

## ✅ RESUMO

| Componente | Status | Ação |
|------------|--------|------|
| **RPC SQL** | ⚠️ REQUER APLICAR | Executar `supabase-migration-fix-rate-limit-increment.sql` no Supabase |
| **Código TypeScript** | ✅ APLICADO | 3 métodos corrigidos + restart feito |
| **Teste** | 🧪 AGUARDANDO | Após aplicar SQL, testar sincronização |

---

## 🎯 PRÓXIMO PASSO

**APLIQUE A MIGRATION SQL AGORA:**

1. Copie todo conteúdo de `supabase-migration-fix-rate-limit-increment.sql`
2. Supabase Dashboard → SQL Editor → Cole → RUN
3. Me avise quando terminar para monitorarmos juntos ✅

---

**Correção implementada em:** 22/11/2025  
**Arquivos criados:** `supabase-migration-fix-rate-limit-increment.sql`, `CORREÇÃO-DEFINITIVA-RATE-LIMIT.md`  
**Código corrigido:** `server/sefaz-service.ts` (linhas 1789, 2256, 2590)  
**Aguardando:** Aplicação da migration SQL no Supabase Production
