# 🔒 Bloqueio Temporário SEFAZ (cStat 656) - Solução Definitiva

## 📋 O que é o erro 656?

O erro **656 - Consumo Indevido** da SEFAZ acontece quando o sistema viola as regras da **Nota Técnica 2014.002 §3.11.4**, especificamente:

### 🚨 Causas (NT 2014.002):

1. **NSU Fora de Sequência** ⚠️ **CAUSA MAIS COMUM**
   - Enviou `ultNSU` diferente do retornado pela SEFAZ na consulta anterior
   - Tentou "resetar" NSU para zero em CNPJ que já teve consultas anteriores
   - **Mensagem:** "Deve ser utilizado o ultNSU nas solicitacoes subsequentes"
   - **Solução aplicada**: Sistema usa APENAS valores retornados pela SEFAZ ✅

2. **Consultas Repetidas sem Aguardar 1h**
   - Recebeu `cStat=137` (sem documentos) e consultou novamente antes de 1 hora
   - **Mensagem:** "Deve ser aguardado 1 hora para efetuar nova solicitação"
   - **Solução aplicada**: Bloqueio automático de 1h após receber cStat=137 ✅

### ✅ **CORREÇÃO CRÍTICA APLICADA (14/11/2025):**

O sistema tinha um **bug grave** que violava a NT 2014.002:
- **Antes**: Botão "Resetar NSU" colocava `ultNSU=0` em CNPJs com histórico
- **Resultado**: Erro 656 imediato (NT 2014.002 permite NSU=0 apenas na primeira consulta real)
- **Agora**: Botão removido, sistema usa APENAS valores retornados pela SEFAZ ✅

## 🎯 Como Usar o Sistema CORRETAMENTE

### ✅ **Empresas Novas (NSU=0):**
1. Cadastre a empresa com certificado
2. Clique **"Sincronizar"** (▶️ Play)
3. Sistema busca todos os XMLs disponíveis
4. NSU atualizado automaticamente

### ✅ **Empresas com NSU Desatualizado:**
1. Clique **"Alinhar NSU"** (🔄 RefreshCw)  
   - Avança NSU sequencialmente sem baixar XMLs
   - Rápido para backlogs grandes
2. Depois clique **"Sincronizar"** (▶️ Play)
   - Baixa XMLs faltantes

### ✅ **Se Receber Erro 656:**
1. ⏰ **Aguarde 1 hora** (bloqueio automático)
2. Sistema mostra: "Bloqueado até [horário do Brasil]"
3. Após desbloqueio automático, use **"Alinhar NSU"**
4. Se persistir: **verifique se há outro sistema** consultando

---

## 📊 Entendendo os Botões

| Botão | Ícone | Quando Usar | O que Faz |
|-------|-------|-------------|-----------|
| **Alinhar NSU** | 🔄 | NSU desatualizado | Avança NSU sem baixar XMLs (rápido) |
| **Sincronizar** | ▶️ | Buscar XMLs novos | Baixa XMLs e atualiza NSU |
| **Excluir** | 🗑️ | Remover empresa | Deleta empresa e XMLs |

**Nota:** "Alinhar NSU" só aparece para empresas que já sincronizaram (NSU ≠ 0)

## Logs de diagnóstico

Agora o sistema mostra logs detalhados na interface de logs:

**Sincronização:**
```
Mensagem: Sincronização - Consultando SEFAZ
Detalhes: {"iteracao":1,"ultNSUEnviado":"000000000000000"}

Mensagem: Sincronização - Resposta SEFAZ
Detalhes: {"iteracao":1,"cStat":"656","xMotivo":"Rejeição: Consumo Indevido...","ultNSURetornado":"","maxNSURetornado":""}
```

**Reconciliação:**
```
Mensagem: Reconciliação - Consultando SEFAZ
Detalhes: {"iteracao":1,"ultNSUEnviado":"77517"}

Mensagem: Reconciliação - Resposta SEFAZ
Detalhes: {"iteracao":1,"cStat":"137","xMotivo":"Nenhum documento localizado","ultNSURetornado":"77517","maxNSURetornado":"80761"}
```

**Em caso de erro de rede/certificado:**
```
Mensagem: Erro ao chamar SEFAZ: [erro]
Detalhes: {"iteracao":1,"ultNSUEnviado":"000000000000000","error":"...","stack":"..."}
```

## Referências

- [NT 2014.002 - Portal Nacional NF-e](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=wLVBlKchUb4%3D)
- [Tecnospeed: Regras de sincronização](https://atendimento.tecnospeed.com.br/hc/pt-br/articles/10794811536791)
- [NetCPA: Atualização das regras de uso indevido](https://netcpa.com.br/colunas/nf-e-04032022-atualizacao-das-regras-de-uso-indevido-do-web-service-nfedistribuicaodfe-nt-2014002/13214)

## Status atual do sistema

✅ **Correções implementadas:**
- ✨ **Bloqueio automático de 61 minutos após erro 656** (evita loop infinito)
- ✨ **Bloqueio automático de 60 minutos após cStat=137** (conforme NT 2014.002 §3.11.4)
- ✨ **Verificação de bloqueio antes de sincronizar** (manual e automático)
- ✨ **Desbloqueio automático** após sincronização bem-sucedida
- ✨ **Loop para imediatamente** ao receber cStat=137 (não faz mais consultas)
- ✨ **Funcionalidade "Resetar NSU" removida** (causava erro 656)
- Validação que bloqueia reconciliação de empresas com NSU=0
- Frontend oculta botão "Alinhar NSU" para empresas novas
- Uso correto de `<distNSU><ultNSU>` conforme NT 2014.002
- Conversão de ultNSU/maxNSU para string (fix TypeError)
- Logs detalhados mostrando NSU enviado e resposta SEFAZ
- Mensagem clara explicando bloqueio temporário

✅ **Proteções ativas:**
- ⏱️ **Bloqueio persistente**: Armazenado em `empresas.bloqueadoAte`
- 🔒 **Bloqueio respeitado**: Cron e endpoints manuais verificam bloqueio
- 🛑 **cStat=137 para o loop**: Sistema NÃO faz mais consultas após receber 137
- Safety guards: 100 iterações (reconciliação), 200 iterações (sincronização)
- Delay entre consultas: 300-500ms
- Alinhamento completo garantido (ultNSU === maxNSU)
- Apenas valores da SEFAZ são usados (nunca valores arbitrários)
