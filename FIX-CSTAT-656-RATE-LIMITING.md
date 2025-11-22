# ✅ CORREÇÃO: cStat 656 - Rate Limiting Implementado

**Data:** 22 de Novembro de 2025  
**Status:** ✅ **CORRIGIDO E PRONTO PARA TESTE**

---

## 🎯 PROBLEMA IDENTIFICADO

Você estava correto! A função `increment_and_check_rate_limit` **JÁ EXISTIA** no Supabase Production.

O problema real era:
- **Rate limiting NÃO estava sendo verificado** durante as sincronizações SEFAZ
- Métodos faziam loops de até 200 consultas **SEM** verificar o limite de 20/hora
- SEFAZ bloqueava com cStat 656 após ~20 consultas

---

## 🔍 ANÁLISE TÉCNICA

### ❌ Código ANTES (SEM rate limiting)

```typescript
// server/sefaz-service.ts - sincronizarEmpresa()
for (let iteracao = 0; iteracao < MAX_ITERACOES; iteracao++) {
  const envelope = this.buildSOAPEnvelopeDistNSU(...);
  responseXml = await this.callDistDFe(empresa, envelope); // ❌ Sem verificar rate limit!
  // ... processa resposta
}
```

**Resultado:** Sistema fazia múltiplas consultas SEFAZ sem respeitar limite → cStat 656

### ✅ Código DEPOIS (COM rate limiting)

```typescript
// server/sefaz-service.ts - sincronizarEmpresa()
for (let iteracao = 0; iteracao < MAX_ITERACOES; iteracao++) {
  // CRÍTICO: Verifica rate limit ANTES de consultar SEFAZ
  const podeConsultar = await storage.checkRateLimit(empresa.id, "distribuicaoDFe", empresa.userId);
  
  if (!podeConsultar) {
    // Log warning e PARA o loop
    await storage.createLog({
      nivel: "warning",
      mensagem: `Rate limit atingido - Sincronização pausada`,
      detalhes: { motivo: "Limite de 20 consultas/hora atingido" }
    });
    break; // Para aqui - aguarda próxima janela
  }
  
  // Só consulta SEFAZ se rate limit permite
  const envelope = this.buildSOAPEnvelopeDistNSU(...);
  responseXml = await this.callDistDFe(empresa, envelope);
  // ... processa resposta
}
```

**Resultado:** Sistema respeita limite de 20 consultas/hora → **SEM cStat 656**

---

## 🛠️ CORREÇÕES IMPLEMENTADAS

### 1. ✅ `sincronizarEmpresa()` - Linha 1785
**Arquivo:** `server/sefaz-service.ts`  
**O que faz:** Sincronização automática (cron 1h) e manual  
**Correção:** Adicionado `checkRateLimit()` antes de cada consulta no loop  

### 2. ✅ `reconciliarUltimoNSU()` - Linha 2244
**Arquivo:** `server/sefaz-service.ts`  
**O que faz:** Alinhamento de NSU com SEFAZ  
**Correção:** Adicionado `checkRateLimit()` antes de cada consulta no loop  

### 3. ✅ `buscarPorPeriodo()` - Linha 2570
**Arquivo:** `server/sefaz-service.ts`  
**O que faz:** Busca avançada por intervalo de NSU  
**Correção:** Adicionado `checkRateLimit()` antes de cada consulta no loop  

### 4. ✅ `xml-download-service.ts` - Linhas 237 e 298
**Arquivo:** `server/xml-download-service.ts`  
**Status:** Já tinha rate limiting implementado (não precisou correção)

---

## 📊 COMPORTAMENTO NOVO

### Fluxo de Sincronização com Rate Limiting

```
1. Cron executa sincronização automática (1h)
   ↓
2. Para cada empresa ativa:
   ├─ Verifica se bloqueada (cStat 656 anterior)
   ├─ Se bloqueada → pula (aguarda desbloqueio)
   └─ Se não bloqueada → inicia sincronização
   ↓
3. Loop de consultas SEFAZ:
   ├─ Iteração 1: checkRateLimit() → TRUE ✅ → Consulta permitida (contador = 1)
   ├─ Iteração 2: checkRateLimit() → TRUE ✅ → Consulta permitida (contador = 2)
   ├─ ...
   ├─ Iteração 20: checkRateLimit() → TRUE ✅ → Consulta permitida (contador = 20)
   ├─ Iteração 21: checkRateLimit() → FALSE ❌ → Consulta BLOQUEADA
   └─ Sistema loga warning e PARA o loop
   ↓
4. Sincronização pausada (parcial)
   ↓
5. Após 1 hora: janela reseta → contador volta para 0
   ↓
6. Próximo cron (1h): Sincronização retoma automaticamente ✅
```

---

## 🧪 TESTE AGORA

### Passo 1: Restart da Aplicação

```bash
# Se em Replit:
# Apenas restart workflow "Start application" (botão no UI)

# Se em Docker (produção):
docker compose -f docker-compose.production.yml restart sefaz-xml-sync
docker logs sefaz-xml-sync -f
```

### Passo 2: Trigger Sincronização Manual

**Opção A - Via Interface:**
1. Abra aplicação: `http://localhost:5000` (ou seu domínio)
2. Vá em "Empresas"
3. Clique em "Sincronizar" em uma empresa

**Opção B - Via API:**
```bash
curl -X POST http://localhost:5000/api/empresas/{EMPRESA_ID}/sincronizar \
  -H "Authorization: Bearer {SEU_TOKEN}"
```

### Passo 3: Monitorar Logs

```bash
# Verificar logs em tempo real
docker logs sefaz-xml-sync -f

# OU via interface web
# http://localhost:5000 → "Logs"
```

**Logs esperados:**

✅ **Sucesso (rate limiting funcionando):**
```
[info] Sincronização - Consultando SEFAZ (iteração 1)
[info] Sincronização - Resposta SEFAZ (cStat 138)
...
[info] Sincronização - Consultando SEFAZ (iteração 20)
[warning] Rate limit atingido - Sincronização pausada
[info] Sincronização finalizada com sucesso (parcial)
```

❌ **Se ainda aparecer cStat 656:**
```
[error] cStat=656: Consumo indevido detectado pela SEFAZ
```
→ **Possível concorrência**: Outro sistema (ERP/contador) está consultando o mesmo CNPJ  
→ **Solução**: Verificar se há outros sistemas consultando este CNPJ simultaneamente

---

## 📈 MONITORAMENTO

### Query 1: Ver Contadores de Rate Limit

```sql
SELECT 
  e.razao_social,
  r.tipo_operacao,
  r.contador,
  (20 - r.contador) AS consultas_restantes,
  r.janela_inicio,
  (r.janela_inicio + INTERVAL '1 hour') AS reset_em
FROM sefaz_rate_limit r
JOIN empresas e ON e.id = r.empresa_id
ORDER BY r.contador DESC;
```

**Interpretação:**
- `contador = 0`: Janela resetou recentemente (ou primeira consulta)
- `contador < 20`: Dentro do limite (pode consultar)
- `contador = 20`: Limite atingido (aguardando reset)
- `reset_em`: Horário que contador volta para 0

### Query 2: Verificar Bloqueios Atuais

```sql
SELECT 
  id,
  razao_social,
  bloqueado_ate,
  CASE 
    WHEN bloqueado_ate > NOW() THEN 'BLOQUEADO ⛔'
    ELSE 'DESBLOQUEADO ✅'
  END AS status,
  CASE 
    WHEN bloqueado_ate > NOW() THEN 
      EXTRACT(EPOCH FROM (bloqueado_ate - NOW())) / 60
    ELSE 0
  END AS minutos_restantes
FROM empresas
WHERE bloqueado_ate IS NOT NULL
ORDER BY bloqueado_ate DESC;
```

### Query 3: Histórico de Rate Limits (últimas 24h)

```sql
SELECT 
  e.razao_social,
  l.created_at,
  l.mensagem,
  l.detalhes
FROM logs l
JOIN empresas e ON e.id = l.empresa_id
WHERE l.mensagem LIKE '%Rate limit%'
  AND l.created_at > NOW() - INTERVAL '24 hours'
ORDER BY l.created_at DESC;
```

---

## ⚠️ TROUBLESHOOTING

### Problema: Ainda toma cStat 656

**Causa 1: Concorrência com Outro Sistema**
- ERP, sistema do contador, ou outro app consultando o mesmo CNPJ
- **Solução:** Desative temporariamente outros sistemas e teste

**Causa 2: Backlog Muito Grande**
- Muitos XMLs pendentes de download
- **Solução:** Sistema vai processar gradualmente (respeitando 20/hora)

**Causa 3: Sincronização Manual Repetida**
- Usuário clicando "Sincronizar" múltiplas vezes
- **Solução:** Aguardar cron automático (1h)

### Problema: Rate Limit Sempre em 0

**Diagnóstico:**
```sql
SELECT * FROM sefaz_rate_limit;
-- Se retornar 0 linhas → nunca foi usado
-- Se retornar linhas → sistema está usando
```

**Solução:** Trigger sincronização manual para testar

### Problema: Logs Não Mostram Rate Limit

**Causa:** Restart não foi feito após código atualizado  
**Solução:**
```bash
docker compose -f docker-compose.production.yml restart sefaz-xml-sync
```

---

## 📊 RESULTADOS ESPERADOS

### ✅ Cenário de Sucesso

**Antes da correção:**
```
10:00 - Sincronização inicia
10:01 - 50 consultas SEFAZ (sem rate limit)
10:02 - cStat 656 (bloqueio SEFAZ)
10:03 - Empresa bloqueada por 1h ❌
11:03 - Desbloqueio
11:04 - Nova sincronização → repete ciclo ❌
```

**Depois da correção:**
```
10:00 - Sincronização inicia
10:01 - Consulta 1 (rate limit: 1/20) ✅
10:02 - Consulta 2 (rate limit: 2/20) ✅
...
10:20 - Consulta 20 (rate limit: 20/20) ✅
10:21 - Consulta 21 → BLOQUEADA (rate limit atingido)
10:21 - Log: "Rate limit atingido - aguardando"
10:21 - Sincronização pausada (parcial) ✅
11:21 - Janela reseta → contador = 0
11:21 - Sincronização retoma automaticamente ✅
```

### 📈 Métricas de Saúde

**Sistema Saudável:**
- ✅ Contadores de rate limit entre 0-20
- ✅ Sem bloqueios `bloqueado_ate` ativos
- ✅ Logs mostram "Rate limit OK" ou "pausada"
- ✅ XMLs sendo baixados gradualmente

**Sistema com Problema:**
- ❌ Contadores sempre em 0 (rate limit não funciona)
- ❌ Bloqueios `bloqueado_ate` recorrentes
- ❌ Logs mostram cStat 656 repetidamente
- ❌ XMLs não são processados

---

## 🎯 PRÓXIMOS PASSOS

1. **Restart da aplicação** ← FAÇA AGORA
2. **Trigger sincronização manual** (teste)
3. **Monitorar logs** (15-30 minutos)
4. **Verificar contadores** (query SQL)
5. **Confirmar sem cStat 656** ✅

---

## 📞 SUPORTE

Se após restart ainda tomar cStat 656:
1. Envie logs completos da sincronização
2. Execute queries de monitoramento
3. Verifique se há concorrência (outro sistema)

---

**Correção aplicada em:** 22/11/2025  
**Arquivos modificados:** `server/sefaz-service.ts` (3 métodos)  
**Pronto para teste:** ✅ SIM  
**Requer restart:** ✅ SIM (apenas uma vez)
