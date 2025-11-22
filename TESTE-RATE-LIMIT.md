# 🧪 TESTE COMPLETO: Rate Limiting Corrigido

**Data:** 22/11/2025  
**Status:** ✅ Migration SQL aplicada - Pronto para teste

---

## 📋 CHECKLIST PRÉ-TESTE

- [x] Migration SQL aplicada no Supabase Production
- [x] Função `increment_and_check_rate_limit` corrigida
- [x] Código TypeScript corrigido (bloqueadoAte persistido)
- [x] Aplicação reiniciada

---

## 🧪 TESTE 1: Verificar Contadores (Supabase Dashboard)

### Query 1: Ver Contadores Atuais

```sql
SELECT 
  e.razao_social,
  r.contador,
  (20 - r.contador) AS consultas_restantes,
  CASE 
    WHEN r.contador >= 20 THEN '⚠️ NO LIMITE'
    ELSE '✅ LIBERADO'
  END AS status
FROM sefaz_rate_limit r
JOIN empresas e ON e.id = r.empresa_id
WHERE r.tipo_operacao = 'distribuicaoDFe';
```

**Esperado:** Nenhum contador acima de 20

### Query 2: Verificar Se Há Bug (contadores > 20)

```sql
SELECT COUNT(*) AS total_acima_limite, MAX(contador) AS contador_max
FROM sefaz_rate_limit
WHERE contador > 20;
```

**Esperado:** 
```
total_acima_limite | contador_max
-------------------|-------------
0                  | NULL ou 20
```

---

## 🧪 TESTE 2: Simular Rate Limit (Supabase Dashboard)

**Copie TODO o script de `monitor-rate-limit.sql` e execute no SQL Editor**

O teste #6 vai:
1. Pegar primeira empresa
2. Verificar contador atual
3. Chamar `increment_and_check_rate_limit()`
4. Verificar se incrementou corretamente

**Resultados esperados:**

### Se contador < 20:
```
✅ CORRETO: Incrementou corretamente (abaixo do limite)
Contador ANTES:  15
Pode consultar:  true
Contador DEPOIS: 16
```

### Se contador = 20:
```
✅ CORRETO: NÃO incrementou quando já no limite
Contador ANTES:  20
Pode consultar:  false
Contador DEPOIS: 20  ← NÃO mudou!
```

### Se aparecer erro:
```
❌ BUG: Incrementou mesmo estando no limite!
```
→ Migration não foi aplicada corretamente

---

## 🧪 TESTE 3: Trigger Sincronização Real

### Opção A: Via Interface Web

1. Abrir aplicação: https://downloadsefaz.dibs.com.br (ou localhost:5000)
2. Fazer login
3. Ir em "Empresas"
4. Clicar "Sincronizar" em uma empresa
5. Aguardar alguns segundos
6. Clicar "Sincronizar" novamente (repetir até atingir 20 consultas)

### Opção B: Via API

```bash
# Substitua {TOKEN} pelo seu JWT token
# Substitua {EMPRESA_ID} pelo ID da empresa

# Trigger manual (repetir 25 vezes para testar limite)
for i in {1..25}; do
  echo "Tentativa $i..."
  curl -X POST https://downloadsefaz.dibs.com.br/api/empresas/{EMPRESA_ID}/sincronizar \
    -H "Authorization: Bearer {TOKEN}" \
    -H "Content-Type: application/json"
  sleep 2
done
```

### O Que Observar:

**Consultas 1-20:**
- ✅ Sincronização executa normalmente
- ✅ XMLs são baixados
- ✅ Logs mostram "Sincronização - Consultando SEFAZ"

**Consulta 21:**
- ✅ Sincronização para
- ✅ Log mostra: `"Rate limit atingido - Bloqueado até [HORÁRIO]"`
- ✅ Empresa fica com `bloqueadoAte` setado

**Consultas 22-25 (nos próximos minutos):**
- ✅ Cron automático PULA empresa bloqueada
- ✅ Nenhuma nova consulta SEFAZ é feita
- ✅ Contador permanece em 20 (NÃO sobe para 21, 22, 23...)

---

## 🧪 TESTE 4: Monitorar Logs em Tempo Real

### Query 1: Ver Últimos Logs de Rate Limit

```sql
SELECT 
  created_at AT TIME ZONE 'America/Sao_Paulo' AS horario,
  e.razao_social,
  l.mensagem,
  l.detalhes->>'proximaConsultaHorarioBrasil' AS proxima_consulta
FROM logs l
JOIN empresas e ON e.id = l.empresa_id
WHERE l.mensagem LIKE '%Rate limit%'
ORDER BY l.created_at DESC
LIMIT 5;
```

**Esperado (quando atingir limite):**
```
horario              | mensagem                                | proxima_consulta
---------------------|----------------------------------------|-------------------
2025-11-22 14:30:00  | Rate limit atingido - Bloqueado até... | 22/11/2025 15:35:00
```

### Query 2: Ver Empresas Bloqueadas

```sql
SELECT 
  e.razao_social,
  e.bloqueado_ate AT TIME ZONE 'America/Sao_Paulo' AS bloqueio_ate,
  EXTRACT(EPOCH FROM (e.bloqueado_ate - NOW())) / 60 AS minutos_restantes,
  r.contador
FROM empresas e
LEFT JOIN sefaz_rate_limit r ON r.empresa_id = e.id
WHERE e.bloqueado_ate > NOW();
```

**Esperado:**
```
razao_social    | bloqueio_ate        | minutos_restantes | contador
----------------|---------------------|-------------------|----------
Empresa Teste   | 2025-11-22 15:35:00 | 58.5              | 20
```

---

## 🧪 TESTE 5: Aguardar Reset (1 hora depois)

**Após 65 minutos do bloqueio:**

### Query: Verificar Reset Automático

```sql
SELECT 
  e.razao_social,
  r.contador AS contador_atual,
  r.janela_inicio AT TIME ZONE 'America/Sao_Paulo' AS nova_janela,
  e.bloqueado_ate AT TIME ZONE 'America/Sao_Paulo' AS bloqueio,
  CASE 
    WHEN e.bloqueado_ate IS NULL OR e.bloqueado_ate < NOW() THEN '✅ DESBLOQUEADO'
    ELSE '🔒 BLOQUEADO'
  END AS status
FROM empresas e
LEFT JOIN sefaz_rate_limit r ON r.empresa_id = e.id AND r.tipo_operacao = 'distribuicaoDFe'
WHERE e.id = '{EMPRESA_ID}';
```

**Esperado:**
```
razao_social    | contador_atual | status
----------------|----------------|---------------
Empresa Teste   | 0              | ✅ DESBLOQUEADO
```

**Trigger nova sincronização:**
- Clicar "Sincronizar" novamente
- Verificar que executa normalmente
- Contador começa de 0 novamente

---

## ✅ CRITÉRIOS DE SUCESSO

| Item | Status | Descrição |
|------|--------|-----------|
| **Contador max = 20** | ⬜ | Nenhum contador acima de 20 no banco |
| **RPC não incrementa** | ⬜ | Teste #6 mostra "NÃO incrementou quando já no limite" |
| **bloqueadoAte persiste** | ⬜ | Campo bloqueado_ate é setado quando limite atinge |
| **Cron respeita bloqueio** | ⬜ | Não tenta sincronizar empresas bloqueadas |
| **Reset automático** | ⬜ | Após 1h, contador volta para 0 |
| **Sincronização retoma** | ⬜ | Após reset, sincronização funciona normalmente |

---

## ❌ TROUBLESHOOTING

### Problema 1: Contador Ainda Sobe Acima de 20

**Sintoma:**
```sql
SELECT MAX(contador) FROM sefaz_rate_limit;
-- Retorna: 21, 22, 23...
```

**Causa:** Migration SQL não foi aplicada corretamente

**Solução:**
```sql
-- Verificar se função foi realmente atualizada
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'increment_and_check_rate_limit';

-- Se ainda tiver UPSERT (INSERT...ON CONFLICT), reaplicar migration
```

### Problema 2: Logs Não Mostram bloqueadoAte

**Sintoma:** Log mostra "Rate limit atingido" mas sem horário de desbloqueio

**Causa:** Código TypeScript antigo ainda em cache

**Solução:**
```bash
# Replit: Restart workflow
# Docker: docker compose restart sefaz-xml-sync
```

### Problema 3: cStat 656 Mesmo Com Contador < 20

**Sintoma:** Erro 656 da SEFAZ mas contador está em 15

**Causa:** Outro sistema (ERP, contador) consultando o mesmo CNPJ

**Solução:** 
- Desativar temporariamente outros sistemas
- Verificar se não há múltiplas instâncias da aplicação rodando

---

## 📊 RESULTADO ESPERADO FINAL

```
15:00 - Sincronização inicia (contador = 0)
  ├─ 15:00:10 - Consulta 1-5   → ✅ OK (contador = 5)
  ├─ 15:00:45 - Consulta 6-10  → ✅ OK (contador = 10)
  ├─ 15:01:20 - Consulta 11-15 → ✅ OK (contador = 15)
  ├─ 15:01:55 - Consulta 16-20 → ✅ OK (contador = 20)
  └─ 15:02:30 - Consulta 21    → ❌ BLOQUEADO até 16:05

15:05 - Cron automático:
  └─ Empresa bloqueada → PULA (não consulta)

15:10 - Cron automático:
  └─ Empresa bloqueada → PULA (não consulta)

16:05 - Bloqueio expira:
  ├─ Contador resetado → 0
  └─ Empresa desbloqueada

16:06 - Próximo cron:
  └─ Sincronização retoma → ✅ OK
```

---

## 📝 RELATÓRIO DE TESTE

Após executar todos os testes, preencha:

```
Data/Hora do Teste: _______________________
Empresa Testada: __________________________

TESTE 1 - Contadores: ☐ PASSOU  ☐ FALHOU
TESTE 2 - RPC:        ☐ PASSOU  ☐ FALHOU
TESTE 3 - Sinc Real:  ☐ PASSOU  ☐ FALHOU
TESTE 4 - Logs:       ☐ PASSOU  ☐ FALHOU
TESTE 5 - Reset:      ☐ PASSOU  ☐ FALHOU

Observações:
_____________________________________________
_____________________________________________
```

---

**Próximo passo:** Execute os testes e me informe os resultados! 🚀
