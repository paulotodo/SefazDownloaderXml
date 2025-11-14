# 🔧 Solução para Erro 656 (Consumo Indevido)

## 📋 O que é o erro 656?

O erro **656 - Consumo Indevido** da SEFAZ acontece quando:

1. ✅ O NSU enviado está desatualizado ou inválido
2. ✅ A SEFAZ espera um `ultNSU` de consulta anterior
3. ✅ Múltiplas tentativas com NSU incorreto
4. ✅ Outro sistema pode estar consultando o mesmo CNPJ

**Mensagens comuns:**
- "Rejeicao: Consumo Indevido (Deve ser aguardado 1 hora...)"
- "Deve ser utilizado o ultNSU nas solicitações subsequentes"

---

## 🚨 Quando Acontece

### Cenário 1: NSU Desatualizado
A empresa tem NSU muito antigo (ex: 80773) e a SEFAZ já "esqueceu" esse NSU.

### Cenário 2: Conflito com Outro Sistema
Outro sistema (ERP, contador, outro desenvolvedor) consultou o CNPJ recentemente.

### Cenário 3: Tentativas Múltiplas
Sistema tentou várias vezes com NSU inválido → SEFAZ bloqueou por 1 hora.

---

## ✅ SOLUÇÃO COMPLETA (Passo a Passo)

### 1️⃣ **Aguarde o Bloqueio Expirar**

**Quanto tempo?** 1 hora (60 minutos) a partir do último erro 656

**Como saber quando expira?**
- O sistema mostra: "Bloqueado até 14 de novembro de 2025 às 20:23:14"
- Isso é o **horário do Brasil (UTC-3)** ✅

**O que fazer:**
- ⏰ Aguarde até o horário indicado
- ✅ Sistema desbloqueia automaticamente
- ❌ NÃO tente sincronizar antes (vai causar novo bloqueio!)

---

### 2️⃣ **Depois do Desbloqueio: Use o Botão "Resetar NSU"**

Na tela **Empresas**, você verá **3 botões** ao lado de cada empresa:

| Botão | Ícone | Função |
|-------|-------|--------|
| **Alinhar NSU** | 🔄 RefreshCw | Avança NSU sem baixar XMLs |
| **Resetar NSU** | ⤾ RotateCcw | **Reseta NSU para 0** |
| **Sincronizar** | ▶️ Play | Baixa XMLs + avança NSU |

**Como usar o Resetar NSU:**

1. **Clique no botão ⤾ (RotateCcw)** da empresa com problema
2. **Confirme** a ação no diálogo
3. **Aguarde** a confirmação (NSU vai para `000000000000000`)
4. **Sincronize** normalmente (botão ▶️ Play)

---

### 3️⃣ **Depois do Reset: Sincronize Normalmente**

Após resetar o NSU:

1. ✅ NSU está em `000000000000000` (válido para primeira consulta)
2. ✅ SEFAZ vai aceitar a consulta
3. ✅ Sistema vai buscar TODOS os XMLs disponíveis
4. ✅ NSU será atualizado automaticamente

**Clique no botão ▶️ (Play)** para sincronizar.

---

## 📊 Fluxograma de Decisão

```
Erro 656?
   ├─ Empresa bloqueada?
   │    ├─ SIM → Aguarde 1 hora
   │    └─ NÃO → Continue
   │
   ├─ Após desbloqueio:
   │    ├─ Tentou "Alinhar NSU" e deu erro 656 novamente?
   │    │    └─ SIM → Use "Resetar NSU"
   │    │
   │    └─ Primeira vez com erro 656?
   │         └─ Tente "Alinhar NSU" primeiro
   │
   └─ Após resetar NSU:
        └─ Use "Sincronizar" (Play)
```

---

## 🎯 Quando Usar Cada Botão

### 🔄 **Alinhar NSU** (RefreshCw)
**Quando usar:**
- NSU está desatualizado mas não muito
- Quer avançar rapidamente sem baixar XMLs
- Já sincronizou antes (NSU ≠ 0)

**O que faz:**
- Avança NSU sequencialmente até o máximo
- NÃO baixa XMLs
- Rápido e seguro

---

### ⤾ **Resetar NSU** (RotateCcw)
**Quando usar:**
- ✅ Recebeu erro 656 várias vezes
- ✅ "Alinhar NSU" não funciona
- ✅ SEFAZ rejeita com "Deve ser utilizado o ultNSU"
- ✅ NSU está muito desatualizado

**O que faz:**
- Reseta NSU para `000000000000000`
- Remove bloqueio (se existir)
- Permite começar do zero

**⚠️ ATENÇÃO:**
- Isso vai buscar TODOS os XMLs desde o início
- Use apenas quando "Alinhar NSU" falhar
- Confirme no diálogo antes de continuar

---

### ▶️ **Sincronizar** (Play)
**Quando usar:**
- Sincronização normal
- Após resetar NSU
- Quer baixar XMLs

**O que faz:**
- Busca XMLs da SEFAZ
- Avança NSU
- Salva documentos no sistema

---

## 🔍 Verificando se Há Outro Sistema

**Como saber se outro sistema está consultando?**

1. **Verifique com contador/ERP:**
   - Pergunte se há sistema automático buscando XMLs
   - Sistemas de contabilidade costumam fazer isso

2. **Verifique logs:**
   - Se erro 656 na **primeira** tentativa → provável outro sistema
   - Se erro 656 **após várias tentativas** → NSU desatualizado

3. **Teste:**
   - Aguarde 1 hora
   - Resete NSU
   - Se der erro 656 **imediatamente** → há outro sistema

**Solução se houver outro sistema:**
- Coordene horários de sincronização
- Ou desative a sincronização automática (cron)
- Ou use apenas um sistema

---

## 📝 Logs e Diagnóstico

**Onde ver logs:**
- Tela **Logs** do sistema
- Filtrar por empresa
- Buscar por "656" ou "Bloqueio"

**O que procurar:**
```json
{
  "nivel": "error",
  "mensagem": "Erro 656 - Bloqueio SEFAZ ativado",
  "detalhes": {
    "ultNSUEnviado": "80773",
    "cStat": "656",
    "bloqueadoAte": "2025-11-14T23:23:14.000Z",
    "bloqueadoAteHorarioBrasil": "14 de novembro de 2025 às 20:23:14"
  }
}
```

**Informações úteis:**
- ✅ `ultNSUEnviado`: NSU que causou o erro
- ✅ `bloqueadoAte`: Timestamp UTC do desbloqueio
- ✅ `bloqueadoAteHorarioBrasil`: Horário local (UTC-3)
- ✅ `diagnostico`: Possível causa do erro

---

## ⚡ Resumo Rápido

| Situação | Ação | Botão |
|----------|------|-------|
| Erro 656 primeira vez | Aguarde 1h → Alinhar NSU | 🔄 |
| Alinhar deu erro 656 | Aguarde 1h → Resetar NSU | ⤾ |
| Após resetar NSU | Sincronizar | ▶️ |
| Bloqueio ativo | Aguarde expirar | - |

---

## 🎯 Exemplo Prático

**Problema:**
```
Erro 656: "Deve ser utilizado o ultNSU nas solicitações subsequentes"
NSU atual: 80773
```

**Solução:**

1. ⏰ **Aguarde 1 hora** (bloqueio SEFAZ)

2. ⤾ **Clique "Resetar NSU"**
   - Confirme no diálogo
   - NSU: 80773 → 000000000000000

3. ▶️ **Clique "Sincronizar"**
   - Sistema vai buscar todos os XMLs
   - NSU será atualizado automaticamente
   - Pronto! ✅

---

## ❓ FAQ

**P: Por que resetar o NSU?**
R: Quando o NSU está muito desatualizado, a SEFAZ não aceita mais. Resetar permite começar do zero.

**P: Vou perder XMLs?**
R: NÃO! O sistema vai baixar TODOS os XMLs disponíveis desde o início.

**P: Posso resetar NSU a qualquer hora?**
R: SIM, mas é recomendado apenas após erro 656 repetido.

**P: O que acontece se resetar NSU errado?**
R: Nada grave. O sistema vai apenas baixar todos os XMLs novamente (pode demorar mais).

**P: Como evitar erro 656?**
R: Sincronize regularmente (1x por hora) e evite múltiplos sistemas consultando o mesmo CNPJ.

---

## 📞 Suporte

Se o problema persistir após seguir todos os passos:

1. ✅ Verifique logs detalhados
2. ✅ Confirme que aguardou 1 hora completa
3. ✅ Verifique se há outro sistema consultando
4. ✅ Entre em contato com suporte técnico da SEFAZ (se necessário)

---

**Status**: ✅ Funcionalidade de Reset NSU implementada e testada  
**Versão**: 1.0  
**Data**: 14 de novembro de 2025
