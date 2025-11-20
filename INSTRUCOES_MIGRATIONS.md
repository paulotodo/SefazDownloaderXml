# 🚀 Instruções de Aplicação das Migrations SQL

## ⚠️ IMPORTANTE: Migrations Obrigatórias

O sistema de **Download Automático de XMLs** está implementado e funcional, mas requer que você aplique **2 migrations SQL** diretamente no Supabase Dashboard **ANTES** de testar a funcionalidade.

**Por que não usar execute_sql_tool?**
- O `execute_sql_tool` conecta apenas ao banco local (development database), nunca ao Supabase (produção)
- Este projeto usa **SEMPRE** Supabase PostgreSQL, conforme especificado em `replit.md`
- Por isso, você precisa aplicar manualmente via Supabase Dashboard

---

## 📋 Passo a Passo

### **MIGRATION 1: Campos de Controle de Download**

1. Abra o [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto
3. Navegue até **SQL Editor** (menu lateral esquerdo)
4. Clique em **New Query**
5. Cole TODO o conteúdo do arquivo `supabase-migration-download-control.sql`
6. Clique em **Run** (ou pressione Ctrl/Cmd + Enter)
7. ✅ Confirme que não há erros (deve retornar "Success")

**O que essa migration faz:**
- Adiciona 4 novos campos na tabela `xmls`:
  - `status_download` (VARCHAR): pendente, processando, completo, erro
  - `tentativas_download` (INTEGER): contador de tentativas (0-5)
  - `ultima_tentativa_download` (TIMESTAMP): timestamp da última tentativa
  - `erro_download` (TEXT): mensagem de erro (se houver)
- Preenche campos existentes com valores default:
  - nfeProc → status_download = 'completo'
  - resNFe → status_download = 'pendente'

---

### **MIGRATION 2: Distributed Locks (PostgreSQL)**

1. No mesmo **SQL Editor** do Supabase Dashboard
2. Clique em **New Query** (para limpar o editor)
3. Cole TODO o conteúdo do arquivo `supabase-migration-distributed-locks.sql`
4. Clique em **Run**
5. ✅ Confirme que não há erros

**O que essa migration faz:**
- Cria tabela `distributed_locks` com:
  - `name` (VARCHAR PRIMARY KEY): identificador do lock
  - `owner` (UUID): processo que detém o lock
  - `acquired_at` (TIMESTAMP): quando foi adquirido
  - `expires_at` (TIMESTAMP): quando expira (TTL automático)
- Cria função PostgreSQL `acquire_download_lock(p_name, p_owner, p_ttl_seconds)`:
  - **Atomic INSERT ON CONFLICT**: garante exclusão mútua
  - Retorna TRUE se adquiriu, FALSE se já ocupado
  - TTL automático (default 180s = 3min)
- Cria função PostgreSQL `release_download_lock(p_name, p_owner)`:
  - Deleta lock apenas se owner correto
  - Retorna TRUE se liberou, FALSE se não era o owner

---

## 🧪 Como Testar Após Aplicar Migrations

### Teste 1: Verificar Campos Criados
```sql
-- No SQL Editor do Supabase Dashboard
SELECT 
  chave_nfe,
  tipo_documento,
  status_download,
  tentativas_download,
  ultima_tentativa_download,
  erro_download
FROM xmls
LIMIT 5;
```

Resultado esperado: Deve retornar XMLs com `status_download` preenchido.

### Teste 2: Verificar Funções PLPGSQL
```sql
-- Testa acquire_download_lock
SELECT acquire_download_lock('test-lock', gen_random_uuid()::uuid, 60);
-- Deve retornar: true (primeira vez)

-- Tenta adquirir novamente com outro owner
SELECT acquire_download_lock('test-lock', gen_random_uuid()::uuid, 60);
-- Deve retornar: false (lock já ocupado)

-- Limpa lock de teste
DELETE FROM distributed_locks WHERE name = 'test-lock';
```

### Teste 3: Aguardar Cron Job (Automático)
- O sistema tem um cron job configurado para rodar **a cada 5 minutos**
- No próximo ciclo (máximo 5min), você verá nos logs:
  ```
  [SupabaseStorage] Lock owner UUID: <uuid-gerado>
  [SupabaseStorage] Lock "xml-download-service" acquire: SUCCESS
  [Download Service] Lock adquirido com sucesso
  [Download Service] Processando downloads pendentes...
  ```

### Teste 4: Trigger Manual (Endpoint)
```bash
# Via curl ou Postman
POST http://localhost:5000/api/xmls/downloads/processar
Content-Type: application/json

{
  "empresaId": "<id-da-empresa>"
}
```

Resposta esperada:
```json
{
  "success": true,
  "message": "Processamento de downloads iniciado",
  "processados": 3
}
```

---

## 📊 Monitoramento

### Dashboard (Interface Web)
Navegue até a página **XMLs** e observe:
- **Cards de Estatísticas**:
  - Total Completos
  - Resumos (resNFe)
  - Pendentes Download
  - Erros Download
- **Badges Visuais** na listagem:
  - 🟡 Pendente (resNFe aguardando download)
  - 🔵 Processando (tentativa em andamento)
  - ✅ Completo (nfeProc baixado com sucesso)
  - ❌ Erro X/5 (falha, mostra tentativas)

### Logs (Backend)
Monitore o console do servidor para:
```
[Download Service] Lock adquirido com sucesso
[Download Service] Processando 3 XMLs pendentes...
[Download Service] Baixando XML completo: 35201234567890123456789012345678901234
[Download Service] XML completo salvo com sucesso
[Download Service] Lock liberado com sucesso
```

### Supabase Dashboard
```sql
-- Vê XMLs pendentes de download
SELECT chave_nfe, status_download, tentativas_download 
FROM xmls 
WHERE tipo_documento = 'resNFe' AND status_download IN ('pendente', 'erro')
ORDER BY tentativas_download ASC;

-- Vê locks ativos
SELECT * FROM distributed_locks;
```

---

## 🔧 Troubleshooting

### Erro: "function acquire_download_lock does not exist"
**Causa**: Migration 2 não foi aplicada.
**Solução**: Aplique `supabase-migration-distributed-locks.sql` no Supabase Dashboard.

### Erro: "column status_download does not exist"
**Causa**: Migration 1 não foi aplicada.
**Solução**: Aplique `supabase-migration-download-control.sql` no Supabase Dashboard.

### Downloads não processam (logs mostram "Lock já ocupado")
**Causa Normal**: Outro processo/instância do servidor está ativo com o lock.
**Solução**: Aguarde até 3min (TTL do lock) ou force release:
```sql
DELETE FROM distributed_locks WHERE name = 'xml-download-service';
```

### XMLs completos (nfeProc) sendo reprocessados
**Causa**: Filtros não estão funcionando corretamente.
**Verificação**: Verifique nos logs se há XMLs com `tipo_documento = 'nfeProc'` sendo processados.
**Solução**: Isso NÃO deve acontecer - há filtro duplo (SQL + inline).

---

## ✅ Checklist de Validação Final

Antes de considerar o sistema pronto:

- [ ] Migration 1 aplicada (campos status_download criados)
- [ ] Migration 2 aplicada (funções acquire/release criadas)
- [ ] Teste SQL: `SELECT * FROM distributed_locks;` funciona
- [ ] Cron executou ao menos 1 vez (logs mostram "Lock adquirido")
- [ ] Dashboard mostra estatísticas de downloads
- [ ] XMLs com status "pendente" são processados automaticamente
- [ ] XMLs com erro (5 tentativas) não são reprocessados
- [ ] Lock é liberado após processamento (finally block)

---

## 📚 Arquivos de Referência

- **Migration 1**: `supabase-migration-download-control.sql`
- **Migration 2**: `supabase-migration-distributed-locks.sql`
- **Service**: `server/xml-download-service.ts`
- **Storage**: `server/supabase-storage.ts`
- **Endpoints**: `server/routes.ts`
- **Frontend**: `client/src/pages/xmls.tsx`
- **Documentação**: `replit.md` (seção "FASE 8")

---

## 🎯 Próximos Passos Após Validação

1. Testar com XMLs reais da SEFAZ (não simulação)
2. Monitorar erros e ajustar retry logic se necessário
3. Configurar alertas para XMLs com status "erro" definitivo (5 tentativas)
4. Otimizar batch size se houver grande volume de XMLs pendentes
5. Considerar índices adicionais para queries de status_download

---

**Dúvidas?** Consulte os logs do servidor e a documentação em `replit.md`.
