# Bloqueio Temporário SEFAZ (cStat 656)

## O que é?

Quando a SEFAZ detecta **consumo indevido** do serviço NFeDistribuicaoDFe, ela aplica um bloqueio temporário de **1 hora** para o CNPJ.

## Sistema de Bloqueio Automático (✨ NOVO)

Quando o erro 656 é detectado, o sistema automaticamente:

1. **Salva timestamp de bloqueio**: Campo `bloqueadoAte` na empresa é preenchido com data/hora de desbloqueio (now + 61 minutos com margem de segurança)
2. **Bloqueia novas tentativas**: Sincronizações (manual e automática) são impedidas até o desbloqueio, evitando loop infinito
3. **Desbloqueio automático**: Campo é limpo automaticamente após primeira sincronização bem-sucedida
4. **Feedback claro**: Interface mostra tempo restante e mensagem explicativa
5. **Logs detalhados**: Registra bloqueio, tentativas bloqueadas e desbloqueio

## Quando acontece?

O erro `cStat=656: Rejeição: Consumo Indevido` ocorre quando:

1. **Múltiplas tentativas com NSU inválido**
   - Tentar consultar com `ultNSU=0` quando a empresa já foi consultada antes
   - Enviar NSU que não segue a sequência retornada pela SEFAZ

2. **Violação da NT 2014.002**
   - Usar `<consNSU><NSU>` ao invés de `<distNSU><ultNSU>`
   - Não usar o `ultNSU` retornado pela SEFAZ nas consultas subsequentes
   - Fabricar valores de NSU arbitrários (deve usar apenas valores retornados pela SEFAZ)

## Mensagem de erro completa

```
Rejeição: Consumo Indevido (Deve ser utilizado o ultNSU nas solicitações subsequentes. Tente após 1 hora)
```

## O que fazer?

### ✅ Solução imediata
**Aguarde 1 hora** antes de tentar qualquer operação (sincronização ou alinhamento de NSU) para esta empresa.

### ✅ Prevenção

1. **Empresas novas (NSU=0):**
   - Use APENAS "Sincronizar" (botão ▶️ Play)
   - NUNCA use "Alinhar NSU" em empresas novas
   - O botão "Alinhar NSU" fica oculto automaticamente

2. **Empresas existentes:**
   - "Sincronizar": Baixa XMLs e atualiza NSU
   - "Alinhar NSU": Apenas avança o ponteiro NSU sem baixar (útil para backlogs grandes)

3. **Regras gerais:**
   - Nunca tentar sincronizar várias vezes em sequência rápida
   - Respeitar o delay entre consultas (300-500ms)
   - Sempre usar os valores de NSU retornados pela SEFAZ

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
- ✨ **Verificação de bloqueio antes de sincronizar** (manual e automático)
- ✨ **Desbloqueio automático** após sincronização bem-sucedida
- Validação que bloqueia reconciliação de empresas com NSU=0
- Frontend oculta botão "Alinhar NSU" para empresas novas
- Uso correto de `<distNSU><ultNSU>` conforme NT 2014.002
- Conversão de ultNSU/maxNSU para string (fix TypeError)
- Logs detalhados mostrando NSU enviado e resposta SEFAZ
- Mensagem clara explicando bloqueio temporário

✅ **Proteções ativas:**
- ⏱️ **Bloqueio persistente**: Armazenado em `empresas.bloqueadoAte`
- 🔒 **Bloqueio respeitado**: Cron e endpoints manuais verificam bloqueio
- Safety guards: 100 iterações (reconciliação), 200 iterações (sincronização)
- Delay entre consultas: 300-500ms
- Alinhamento completo garantido (ultNSU === maxNSU)
- Apenas valores da SEFAZ são usados (nunca valores arbitrários)
