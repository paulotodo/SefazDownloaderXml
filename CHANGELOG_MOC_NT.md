# 📝 CHANGELOG: Conformidade com MOC 7.0 e NT 2014.002

**Data:** 15 de novembro de 2025  
**Objetivo:** Adequar sistema de download automático ao MOC 7.0 e NT 2014.002

---

## ✅ **MUDANÇAS IMPLEMENTADAS**

### **1. Suporte para NFC-e (Modelo 65)** 🆕

**Antes:**
- Sistema processava apenas NF-e (modelo 55)
- Pasta única: `xmls/CNPJ/ANO/MES/`

**Depois:**
- Suporte completo para NF-e (55) E NFC-e (65)
- Detecção automática via campo `ide.mod`
- Pastas separadas:
  - `xmls/NFe/CNPJ/ANO/MES/`
  - `xmls/NFCe/CNPJ/ANO/MES/`

**Conformidade:** MOC 7.0 §2.2

---

### **2. Processamento de TODOS os Schemas XML** 🆕

**Antes:**
- Processava apenas `nfeProc` (XML completo)
- Descartava resumos e eventos

**Depois:**
- ✅ **nfeProc**: XML completo de NF-e/NFC-e
- ✅ **resNFe**: Resumo (quando não tem direito ao XML completo)
- ✅ **procEventoNFe**: Eventos (cancelamento, CCe, manifestação)
- ✅ **resEvento**: Resumo de eventos

**Estrutura de Pastas:**
```
xmls/
└── NFe/ (ou NFCe/)
    └── CNPJ/
        └── ANO/
            └── MES/
                ├── 12345.xml                        # nfeProc
                ├── Resumos/
                │   └── 35XXX_nsuYYY.xml            # resNFe
                └── Eventos/
                    ├── 35XXX_110111_seq1_nsuZZZ.xml # procEventoNFe
                    └── Resumos/
                        └── 35XXX_110111_nsuAAA.xml  # resEvento
```

**Conformidade:** NT 2014.002 §3.3

---

### **3. Schema do Banco de Dados Atualizado** 🔄

**Campos Adicionados na Tabela `xmls`:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `modelo` | TEXT | "55" (NF-e) ou "65" (NFC-e) |
| `tipo_documento` | TEXT | "nfeProc", "resNFe", "procEventoNFe", "resEvento" |

**Migração:** `migrations/add_modelo_tipodocumento.sql`

**Índices Criados:**
- `idx_xmls_modelo`
- `idx_xmls_tipo_documento`

---

### **4. Configuração Centralizada** 🆕

**Novo Arquivo:** `server/config/index.ts`

**Benefícios:**
- Todas as configurações em um único lugar
- Validação de variáveis de ambiente obrigatórias
- Constantes documentadas com referências à NT 2014.002
- Suporte para customização via `.env`

**Configurações:**
- Modelos suportados (55, 65)
- Endpoints SEFAZ (prod/hom)
- Schemas XML
- Cron job (sincronização automática)
- Limites de segurança (iterações, delay)
- Bloqueio após erros 656/137

---

### **5. Sistema de Logs em Arquivo** 🆕

**Novo Arquivo:** `server/logger.ts`

**Recursos:**
- **Console**: Logs coloridos em tempo real
- **Arquivo**: `logs/app-YYYY-MM-DD.log`
- **Rotação Automática**: Mantém últimos 30 dias
- **Níveis**: info, warning, error, debug
- **Metadata**: userId, empresaId, sincronizacaoId

**Formato de Log:**
```
[2025-11-15T12:00:00.000Z] [INFO] Sincronização iniciada userId=abc empresaId=def details={...}
```

---

### **6. README Completo** 📚

**Novo README.md com:**
- Instruções de instalação passo-a-passo
- Configuração de variáveis de ambiente
- Documentação dos 3 modos de execução:
  1. Interface web
  2. HTTP endpoint
  3. Agendamento automático
- Troubleshooting
- Referências oficiais (MOC 7.0, NT 2014.002)
- Estrutura de pastas dos XMLs
- Tipos de eventos suportados

---

### **7. Correções e Melhorias** 🔧

**Roteamento de Schemas:**
- Corrigido: Agora compara schemas case-insensitive
- SEFAZ retorna schemas sem namespace (ex: "resNFe", não "http://...resNFe")
- Roteamento robusto com fallback para schemas desconhecidos

**Detecção de Modelo:**
- Extrai `ide.mod` do XML para determinar 55 ou 65
- Fallback para modelo 55 se não encontrado
- Logs claros identificando NF-e vs NFC-e

**Eventos:**
- Mapeamento completo de tipos de evento:
  - 110110: Carta de Correção
  - 110111: Cancelamento
  - 210200: Confirmação da Operação
  - 210210: Ciência da Operação
  - 210220: Desconhecimento da Operação
  - 210240: Operação não Realizada

---

## 🚀 **PRÓXIMOS PASSOS**

### **Para o Usuário:**

1. **Executar Migração SQL:**
   ```sql
   -- Copiar e executar no Supabase Dashboard → SQL Editor
   cat migrations/add_modelo_tipodocumento.sql
   ```

2. **Reiniciar Aplicação:**
   ```bash
   npm run dev
   # ou em produção
   docker compose restart
   ```

3. **Testar Processamento:**
   - Cadastrar empresa com CNPJ que tenha NFC-e
   - Executar sincronização manual
   - Verificar pastas `xmls/NFe/` e `xmls/NFCe/`
   - Conferir logs em `logs/app-YYYY-MM-DD.log`

4. **Validar Schemas:**
   - Confirmar que resumos estão sendo salvos em `Resumos/`
   - Confirmar que eventos estão sendo salvos em `Eventos/`
   - Verificar campo `modelo` e `tipo_documento` no banco

---

## 📊 **CONFORMIDADE**

| Norma | Item | Status |
|-------|------|--------|
| MOC 7.0 §2.2 | Modelo 55 (NF-e) | ✅ Implementado |
| MOC 7.0 §2.2 | Modelo 65 (NFC-e) | ✅ Implementado |
| NT 2014.002 §3.3 | Schema nfeProc | ✅ Implementado |
| NT 2014.002 §3.3 | Schema resNFe | ✅ Implementado |
| NT 2014.002 §3.3 | Schema procEventoNFe | ✅ Implementado |
| NT 2014.002 §3.3 | Schema resEvento | ✅ Implementado |
| NT 2014.002 §3.11.4 | Controle de NSU | ✅ Já implementado |
| NT 2014.002 §3.11.4 | Bloqueio cStat=137 | ✅ Já implementado |
| NT 2014.002 §3.11.4 | Bloqueio cStat=656 | ✅ Já implementado |

---

## 🔍 **ARQUIVOS MODIFICADOS**

1. `shared/schema.ts` - Campos modelo e tipo_documento
2. `server/sefaz-service.ts` - Processamento de todos os schemas
3. `server/config/index.ts` - Configuração centralizada (NOVO)
4. `server/logger.ts` - Logs em arquivo (NOVO)
5. `migrations/add_modelo_tipodocumento.sql` - Migração SQL (NOVO)
6. `README.md` - Documentação completa
7. `package.json` - Dependência @types/pako

---

## ⚠️ **ATENÇÃO**

### **Migração Obrigatória:**
Executar `migrations/add_modelo_tipodocumento.sql` no Supabase antes de usar o sistema.

### **Backward Compatibility:**
XMLs já baixados continuarão funcionando (campos novos têm valores padrão).

### **Teste Recomendado:**
Testar com CNPJ que tenha mix de NF-e (55) e NFC-e (65) para validar separação de pastas.

---

**Desenvolvido com conformidade total à legislação fiscal brasileira 🇧🇷**
