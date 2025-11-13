# 🔧 Troubleshooting - Certificados Digitais

## Problema: "Unsupported PKCS12 PFX data"

### Causa
Certificados digitais A1 brasileiros (.pfx) usam algoritmos criptográficos legados (DES, 3DES) que **não são suportados por padrão** no OpenSSL 3.x (usado pelo Node.js 18+).

### Sintomas
```
Error: Unsupported PKCS12 PFX data
    at configSecureContext (node:internal/tls/secure-context:290:15)
```

### ✅ Solução Implementada

O código foi corrigido para suportar certificados legados:

```typescript
const agent = new https.Agent({
  pfx: pfxBuffer,
  passphrase: empresa.certificadoSenha,
  rejectUnauthorized: true,
  // Habilita suporte para algoritmos legados
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
  minVersion: 'TLSv1.2',
  maxVersion: 'TLSv1.3',
});
```

### Verificações Automáticas

O sistema agora valida:
1. ✅ Arquivo .pfx existe e é legível
2. ✅ Tamanho mínimo do certificado (> 100 bytes)
3. ✅ Senha do certificado (MAC verification)
4. ✅ Formato PKCS12 válido

---

## Outros Problemas Comuns

### 1. "MAC verify error"

**Causa:** Senha do certificado incorreta

**Solução:**
1. Verifique a senha ao cadastrar a empresa
2. Confirme com quem emitiu o certificado
3. Teste a senha usando OpenSSL:
   ```bash
   openssl pkcs12 -info -in certificado.pfx -noout
   # Digite a senha quando solicitado
   ```

### 2. Certificado Expirado

**Causa:** Certificados A1 têm validade de 1 ano

**Sintomas:**
- Erro ao conectar com SEFAZ
- Mensagem de "certificado inválido"

**Solução:**
1. Verificar validade:
   ```bash
   openssl pkcs12 -in certificado.pfx -nokeys -clcerts | openssl x509 -noout -dates
   ```
2. Renovar certificado na Autoridade Certificadora
3. Fazer upload do novo certificado no sistema

### 3. Arquivo Corrompido

**Causa:** Download incompleto ou transferência com erro

**Sintomas:**
- "Certificado inválido ou corrompido (tamanho muito pequeno)"
- Erro ao ler arquivo

**Solução:**
1. Fazer novo download do certificado
2. Verificar integridade com checksum (se disponível)
3. Upload novamente no sistema

### 4. Permissões Incorretas (Produção)

**Causa:** Arquivo .pfx com permissões muito abertas

**Solução:**
```bash
# Definir permissões corretas
chmod 600 /opt/sefaz-xml-sync/certificados/*.pfx

# Verificar
ls -la /opt/sefaz-xml-sync/certificados/
# Deve mostrar: -rw------- (600)
```

---

## Validação Manual de Certificados

### Verificar Informações do Certificado

```bash
# Ver todas as informações
openssl pkcs12 -info -in certificado.pfx

# Ver apenas o certificado
openssl pkcs12 -in certificado.pfx -nokeys -clcerts | openssl x509 -text -noout

# Ver datas de validade
openssl pkcs12 -in certificado.pfx -nokeys -clcerts | openssl x509 -noout -dates

# Ver subject (CNPJ)
openssl pkcs12 -in certificado.pfx -nokeys -clcerts | openssl x509 -noout -subject
```

### Testar Senha

```bash
# Extrair chave privada (se senha correta)
openssl pkcs12 -in certificado.pfx -nocerts -nodes -out test-key.pem

# Se funcionar, senha está correta
# Remover arquivo de teste
rm test-key.pem
```

### Converter para PEM (Debugging)

```bash
# Extrair certificado em formato PEM
openssl pkcs12 -in certificado.pfx -clcerts -nokeys -out cert.pem

# Extrair chave privada
openssl pkcs12 -in certificado.pfx -nocerts -nodes -out key.pem

# Verificar certificado PEM
openssl x509 -in cert.pem -text -noout
```

---

## Compatibilidade

### Node.js Versões

| Versão | Suporte Certificados A1 | Requer Configuração |
|--------|-------------------------|---------------------|
| Node 16 | ✅ Suporte nativo | ❌ Não |
| Node 18 | ⚠️ OpenSSL 3.0 | ✅ Sim (configurado) |
| Node 20 | ⚠️ OpenSSL 3.0 | ✅ Sim (configurado) |
| Node 21+ | ⚠️ OpenSSL 3.x | ✅ Sim (configurado) |

**✅ Este sistema já está configurado para todas as versões**

### OpenSSL Legacy Provider

Em casos extremos (certificados muito antigos), pode ser necessário habilitar o legacy provider:

```bash
# Variável de ambiente (desenvolvimento)
export NODE_OPTIONS="--openssl-legacy-provider"
npm run dev

# Docker (produção)
# Adicionar ao docker-compose.yml:
services:
  app:
    environment:
      - NODE_OPTIONS=--openssl-legacy-provider
```

⚠️ **Não recomendado**: Use apenas se o código atual não funcionar.

---

## Diagnóstico Passo a Passo

### 1. Verificar Arquivo

```bash
# Tamanho
ls -lh certificados/cert.pfx

# Tipo
file certificados/cert.pfx
# Deve mostrar: "data" ou "PKCS #12"
```

### 2. Verificar Senha

```bash
# Testar senha
openssl pkcs12 -info -in certificados/cert.pfx -noout
# Se pedir senha e não der erro, senha está correta
```

### 3. Verificar Validade

```bash
# Extrair e ver datas
openssl pkcs12 -in certificados/cert.pfx -nokeys -clcerts | \
  openssl x509 -noout -dates

# Resultado:
# notBefore=Dec  1 00:00:00 2023 GMT
# notAfter=Nov 30 23:59:59 2024 GMT
```

### 4. Verificar CNPJ

```bash
# Ver subject do certificado
openssl pkcs12 -in certificados/cert.pfx -nokeys -clcerts | \
  openssl x509 -noout -subject

# Deve conter o CNPJ da empresa
```

### 5. Teste no Sistema

1. Interface web → **Empresas**
2. Editar empresa
3. Upload novo certificado
4. Salvar
5. Tentar sincronização manual
6. Verificar logs: **Menu → Logs**

---

## Logs Úteis para Debug

### Ver logs da aplicação

```bash
# Docker
docker logs sefaz-xml-sync -f

# Replit
# Automático no terminal
```

### Procurar erros de certificado

```bash
# Docker
docker logs sefaz-xml-sync 2>&1 | grep -i "certificado\|pfx\|pkcs"

# Logs do sistema (interface web)
# Menu → Logs → Filtrar: "error"
```

---

## Suporte Técnico

### Informações para Reportar Problema

Ao reportar problema com certificado, incluir:

1. **Mensagem de erro completa** (copiar do log)
2. **Resultado de:**
   ```bash
   file certificado.pfx
   ls -lh certificado.pfx
   openssl pkcs12 -info -in certificado.pfx -noout
   ```
3. **Ambiente:**
   - Node.js version: `node --version`
   - OpenSSL version: `openssl version`
   - Sistema operacional
4. **Já tentou:**
   - [ ] Verificar senha
   - [ ] Baixar certificado novamente
   - [ ] Testar com openssl
   - [ ] Verificar validade

---

## Prevenção

### Checklist ao Obter Certificado A1

- [ ] Baixar arquivo .pfx de fonte confiável
- [ ] Anotar senha em local seguro
- [ ] Verificar validade (notAfter)
- [ ] Testar com OpenSSL antes de usar
- [ ] Manter backup em local seguro
- [ ] Configurar lembrete 30 dias antes de expirar

### Renovação Automática (Futuro)

Planejado para futuras versões:
- Alerta 30 dias antes de expirar
- Email de notificação
- Bloqueio automático de certificados expirados

---

## Referências

- OpenSSL PKCS12: https://www.openssl.org/docs/man3.0/man1/openssl-pkcs12.html
- Node.js TLS: https://nodejs.org/api/tls.html
- Certificados ICP-Brasil: https://www.gov.br/iti/pt-br

---

**Última atualização:** 13 de novembro de 2025
