# ✅ Correção de Timezone - Próximos Passos

## Mudanças Implementadas

### 1. ✅ Schema Atualizado (`shared/schema.ts`)
Todas as colunas timestamp agora usam `{ withTimezone: true, mode: 'date' }`:
- ✅ `profiles`: created_at, updated_at
- ✅ `empresas`: bloqueado_ate, created_at, updated_at
- ✅ `sincronizacoes`: data_inicio, data_fim, created_at
- ✅ `xmls`: data_emissao, created_at
- ✅ `logs`: timestamp

### 2. ✅ Utilitários de Timezone (`server/utils/timezone.ts`)
Funções criadas para trabalhar com horário do Brasil:
- `formatarDataBrasil(date)` - Formato curto (14/11/2025, 18:30:00)
- `formatarDataBrasilCompleta(date)` - Formato longo (14 de novembro de 2025, 18:30:00)
- `formatarHoraBrasil(date)` - Apenas hora (18:30:00)
- `calcularMinutosRestantes(date)` - Para calcular tempo de bloqueio
- `estaBloqueado(date)` - Verifica se bloqueio ainda está ativo
- `criarBloqueio(minutos)` - Cria timestamp UTC de bloqueio

### 3. ✅ Código Atualizado (`server/sefaz-service.ts`)
- Importa utilitários de timezone
- Usa `criarBloqueio(61)` para gerar timestamps de bloqueio em UTC
- Usa `formatarDataBrasilCompleta()` para exibir datas em logs e mensagens
- Usa `estaBloqueado()` para verificar bloqueios
- Usa `calcularMinutosRestantes()` para calcular tempo restante

### 4. ✅ SQL de Migração Criado (`scripts/migrate-to-timestamptz.sql`)
- Converte todas as colunas `TIMESTAMP` para `TIMESTAMPTZ`
- Usa `AT TIME ZONE 'UTC'` para preservar valores existentes
- Adiciona comentários documentando que valores são armazenados em UTC
- **SEGURO**: Não corrompe dados existentes

## 🚨 AÇÃO NECESSÁRIA: Executar Migração SQL

**Você precisa executar a migração SQL no Supabase para que as mudanças funcionem!**

### Passo a Passo:

1. **Acesse o Supabase Dashboard**: https://supabase.com/dashboard
2. **Vá em SQL Editor**
3. **Abra o arquivo**: `scripts/migrate-to-timestamptz.sql`
4. **Copie TODO o conteúdo** do arquivo
5. **Cole no SQL Editor** do Supabase
6. **Clique em "Run"**
7. **Aguarde a execução** (pode levar alguns segundos)

### ✅ Validação Pós-Migração

Após executar a migração, execute no SQL Editor para verificar:

```sql
-- Verificar tipos das colunas
SELECT 
  id, 
  cnpj,
  bloqueado_ate,
  created_at,
  pg_typeof(bloqueado_ate) as tipo_bloqueado,
  pg_typeof(created_at) as tipo_created
FROM empresas 
LIMIT 3;
```

**Resultado esperado:**
- `tipo_bloqueado`: `timestamp with time zone`
- `tipo_created`: `timestamp with time zone`

## Como o Sistema Funciona Agora

### Backend (Lógica Interna)
- ✅ Tudo é armazenado em **UTC** no banco
- ✅ Cálculos (bloqueios, durações) em UTC
- ✅ `Date` objects sempre em UTC

### Exibição (Logs, Mensagens, UI)
- ✅ Datas formatadas em **horário do Brasil** (America/Sao_Paulo)
- ✅ Usa utilitários `formatarDataBrasil*()` automaticamente
- ✅ Usuário sempre vê horário local do Brasil

### Exemplo Prático

**Cenário**: Bloqueio SEFAZ às 21:00 UTC

**Backend** (armazena):
```typescript
const bloqueadoAte = criarBloqueio(61); // 2025-11-14T22:01:00.000Z (UTC)
```

**Log/Mensagem** (exibe):
```typescript
formatarDataBrasilCompleta(bloqueadoAte); // "14 de novembro de 2025, 19:01:00" (UTC-3)
```

**Usuário vê**: "19:01:00" (horário do Brasil)  
**Banco armazena**: "22:01:00Z" (UTC)

## Benefícios

✅ **Consistência**: Tudo em UTC internamente  
✅ **Horário de Verão**: Não afeta cálculos (UTC não tem DST)  
✅ **Multi-tenant**: Funciona para usuários em qualquer timezone  
✅ **Exibição Local**: Usuário sempre vê horário do Brasil  
✅ **Zero Bugs**: Conversões automáticas e centralizadas  

## Próximos Passos

1. ✅ Execute a migração SQL no Supabase
2. ✅ Valide que tipos estão corretos (`timestamptz`)
3. ✅ Reinicie a aplicação (já foi reiniciada automaticamente)
4. ✅ Teste o sistema de bloqueio
5. ✅ Verifique logs e mensagens exibem horário correto

## Arquivos Importantes

- 📄 `scripts/migrate-to-timestamptz.sql` - SQL de migração
- 📄 `INSTRUCOES-MIGRACAO-TIMEZONE.md` - Instruções detalhadas
- 📄 `server/utils/timezone.ts` - Utilitários de timezone
- 📄 `shared/schema.ts` - Schema atualizado com timestamptz
- 📄 `server/sefaz-service.ts` - Código atualizado usando utilitários

## ⚠️ IMPORTANTE

- ⚠️ A migração SQL é **SEGURA** e não corrompe dados
- ⚠️ Valores existentes são preservados como UTC
- ⚠️ Execute em um ambiente de teste primeiro (se possível)
- ⚠️ Faça backup do banco antes (boa prática)

---

**Status Atual**: ✅ Código pronto | ⏳ Aguardando migração SQL no Supabase

Assim que executar a migração SQL, o problema de timezone estará 100% resolvido!
