# Instruções para Migração de Timezone

## ⚠️ ATENÇÃO - LEIA ANTES DE EXECUTAR

Esta migração converte todas as colunas `timestamp` para `timestamptz` (timestamp with timezone) preservando os valores existentes como UTC.

## Pré-requisitos

1. **BACKUP DO BANCO** - Faça backup completo antes de executar
2. **Teste em staging** - Execute primeiro em ambiente de desenvolvimento/staging
3. **Validação** - Verifique timestamps após migração

## Por que esta migração é necessária?

O problema atual:
- Banco está usando `TIMESTAMP` (sem timezone)
- Valores são armazenados literalmente, causando confusão de fusos horários
- Usuário reportou timestamps com +3h de diferença

A solução:
- Usar `TIMESTAMPTZ` (timestamp with timezone)
- Armazenar tudo em UTC internamente
- Converter para America/Sao_Paulo apenas na exibição

## Como executar a migração

### Opção 1: Supabase SQL Editor (Recomendado)

1. Acesse: https://supabase.com/dashboard
2. Vá em: **SQL Editor**
3. Copie e cole o conteúdo de `scripts/migrate-to-timestamptz.sql`
4. Clique em **Run**
5. Aguarde conclusão (pode levar alguns segundos)

### Opção 2: psql (se tiver acesso direto)

```bash
psql -h [HOST] -U [USER] -d [DATABASE] -f scripts/migrate-to-timestamptz.sql
```

## Validação pós-migração

Execute no SQL Editor para verificar:

```sql
-- Verificar tipos das colunas
SELECT 
  id, 
  cnpj,
  razao_social,
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

```sql
-- Verificar que valores não mudaram (comparar com backup)
SELECT 
  id,
  bloqueado_ate,
  bloqueado_ate AT TIME ZONE 'America/Sao_Paulo' as horario_brasil
FROM empresas
WHERE bloqueado_ate IS NOT NULL
LIMIT 3;
```

**O que observar:**
- `bloqueado_ate` deve estar em UTC (mesmo valor de antes)
- `horario_brasil` deve mostrar -3h (UTC-3)

## O que mudou no código?

### 1. Schema (`shared/schema.ts`)
Todas as colunas timestamp agora usam:
```typescript
timestamp("coluna", { withTimezone: true, mode: 'date' })
```

### 2. Utilitários de timezone (`server/utils/timezone.ts`)
Funções para formatar datas em horário do Brasil:
- `formatarDataBrasil(date)` - Formato curto
- `formatarDataBrasilCompleta(date)` - Formato longo
- `formatarHoraBrasil(date)` - Apenas hora
- `calcularMinutosRestantes(date)` - Para bloqueios
- `estaBloqueado(date)` - Verifica se ainda bloqueado
- `criarBloqueio(minutos)` - Cria timestamp de bloqueio

### 3. Lógica de negócio
- Backend: Trabalha sempre em UTC (Date objects)
- Exibição: Usa utilitários para formatar em America/Sao_Paulo
- Cálculos: Sempre em UTC (evita problemas com horário de verão)

## Rollback (se necessário)

Se algo der errado, restore o backup:

```sql
-- No Supabase, use a feature de "Point in Time Recovery" (PITR)
-- Ou restaure do backup SQL manualmente
```

## Próximos passos após migração

1. ✅ Verificar que tipos estão corretos (`timestamptz`)
2. ✅ Validar que valores não mudaram
3. ✅ Reiniciar aplicação
4. ✅ Testar bloqueio automático
5. ✅ Verificar exibição de datas na interface

## Referências

- [PostgreSQL Timezone Documentation](https://www.postgresql.org/docs/current/datatype-datetime.html)
- [Best Practices for Timezone Storage](https://wiki.postgresql.org/wiki/Don%27t_Do_This#Don.27t_use_timestamp_.28without_time_zone.29)
