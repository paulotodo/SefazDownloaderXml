# 📦 Como Subir o Código para o GitHub

## Guia Completo Passo a Passo

---

## 📋 Pré-requisitos

- [ ] Git instalado (`git --version`)
- [ ] Conta no GitHub (https://github.com)

---

## 🚀 Método 1: Criar Repositório Novo (Recomendado)

### **Passo 1: Criar Repositório no GitHub**

1. Acesse: https://github.com
2. Clique no **+** (canto superior direito) → **New repository**
3. Preencha:
   - **Repository name:** `sefaz-xml-sync`
   - **Description:** `Sistema de download automático de XMLs da SEFAZ com autenticação multi-usuário`
   - **Visibility:** 
     - ✅ **Private** (recomendado - código da empresa)
     - ⚠️ **Public** (código aberto - cuidado com secrets!)
   - ❌ **NÃO** marque "Add a README file"
   - ❌ **NÃO** marque "Add .gitignore"
   - ❌ **NÃO** escolha licença ainda
4. Clique: **Create repository**

**Copie a URL do repositório:**
- HTTPS: `https://github.com/SEU_USUARIO/sefaz-xml-sync.git`
- SSH: `git@github.com:SEU_USUARIO/sefaz-xml-sync.git`

---

### **Passo 2: No Replit (Terminal)**

#### **2.1. Inicializar Git (se ainda não estiver)**

```bash
# Verificar se já é repositório Git
git status

# Se der erro "not a git repository", inicializar:
git init
```

#### **2.2. Configurar Git (primeira vez)**

```bash
# Configurar nome e email
git config --global user.name "Seu Nome"
git config --global user.email "seu-email@example.com"

# Verificar configuração
git config --list
```

#### **2.3. Verificar arquivos que serão commitados**

```bash
# Ver arquivos não rastreados
git status

# IMPORTANTE: Verificar se NÃO aparecem:
# - .env ou .env.*
# - certificados/
# - xmls/
# Se aparecerem, verificar .gitignore!
```

#### **2.4. Adicionar arquivos ao staging**

```bash
# Adicionar todos os arquivos
git add .

# Verificar o que foi adicionado
git status
```

#### **2.5. Criar commit inicial**

```bash
# Commit com mensagem descritiva
git commit -m "feat: sistema completo de download automático de XMLs SEFAZ

- Autenticação multi-usuário com Supabase
- Sincronização automática a cada 1 hora
- Upload de certificados digitais
- Navegador de XMLs por CNPJ/Ano/Mês
- Deploy Docker standalone (Nginx + Certbot)
- Deploy Portainer + Traefik
- Row-Level Security (RLS) para isolamento de dados
- Documentação completa de deployment"
```

---

### **Passo 3: Conectar ao GitHub e Fazer Push**

#### **3.1. Adicionar remote**

```bash
# Substituir SEU_USUARIO pelo seu username do GitHub
git remote add origin https://github.com/SEU_USUARIO/sefaz-xml-sync.git

# Verificar
git remote -v
```

#### **3.2. Renomear branch para 'main' (se necessário)**

```bash
# Verificar branch atual
git branch

# Se for 'master', renomear para 'main'
git branch -M main
```

#### **3.3. Push inicial**

```bash
# Push para GitHub
git push -u origin main
```

**Se pedir autenticação:**
- **Username:** seu username do GitHub
- **Password:** 
  - ❌ **NÃO** use sua senha do GitHub (não funciona mais!)
  - ✅ Use um **Personal Access Token (PAT)**

---

### **Passo 4: Criar Personal Access Token (se necessário)**

Se o push pedir senha e falhar:

1. GitHub → **Settings** (seu perfil)
2. **Developer settings** (menu lateral, final)
3. **Personal access tokens** → **Tokens (classic)**
4. **Generate new token** → **Generate new token (classic)**
5. Preencha:
   - **Note:** `Replit - SEFAZ XML Sync`
   - **Expiration:** `90 days` (ou mais)
   - **Scopes:** Marque:
     - ✅ `repo` (acesso completo a repositórios)
6. **Generate token**
7. **COPIE O TOKEN** (não será mostrado novamente!)

**Fazer push novamente:**
```bash
git push -u origin main

# Username: seu-usuario
# Password: cole-o-token-aqui
```

---

### **Passo 5: Verificar no GitHub**

1. Acesse: `https://github.com/SEU_USUARIO/sefaz-xml-sync`
2. Verifique se todos os arquivos foram enviados
3. Verifique se **NÃO** aparecem:
   - ❌ Arquivos `.env*`
   - ❌ Pasta `certificados/`
   - ❌ Pasta `xmls/`
   - ❌ Arquivos `.pfx`

---

## 🔄 Atualizações Futuras

### **Fazer alterações e enviar para o GitHub:**

```bash
# 1. Verificar alterações
git status

# 2. Adicionar arquivos modificados
git add .

# 3. Commit com mensagem descritiva
git commit -m "feat: adicionar funcionalidade X"

# 4. Enviar para GitHub
git push
```

### **Exemplos de mensagens de commit:**

```bash
# Nova funcionalidade
git commit -m "feat: adicionar exportação de XMLs em PDF"

# Correção de bug
git commit -m "fix: corrigir parsing de SOAP com múltiplos documentos"

# Atualização de documentação
git commit -m "docs: atualizar guia de deployment Portainer"

# Refatoração
git commit -m "refactor: melhorar performance da sincronização SEFAZ"

# Alteração de configuração
git commit -m "chore: atualizar dependências do projeto"
```

---

## 🔐 Segurança: O Que NUNCA Commitar

### **Arquivos sensíveis (já no .gitignore):**

- ❌ `.env*` (contém secrets do Supabase)
- ❌ `certificados/` (certificados digitais .pfx)
- ❌ `xmls/` (dados das empresas)
- ❌ `acme.json` (certificados Let's Encrypt)
- ❌ Logs com informações sensíveis

### **Se você commitou por engano:**

```bash
# ATENÇÃO: Só use isso ANTES de fazer push!
# Remove arquivo do staging
git reset HEAD arquivo-sensivel.env

# Remove do último commit (se já commitou)
git reset --soft HEAD~1

# Remove arquivo do Git mas mantém no disco
git rm --cached arquivo-sensivel.env

# Commit novamente (sem o arquivo sensível)
git commit -m "chore: remover arquivo sensível"
```

**⚠️ Se já fez push para GitHub:**
1. **NUNCA** use o mesmo secret novamente
2. Gere novos secrets (Supabase, SESSION_SECRET)
3. Delete o repositório do GitHub e crie novo
4. **OU** use ferramentas como BFG Repo-Cleaner (avançado)

---

## 📂 Estrutura de Branches (Opcional - Avançado)

### **Para trabalhar com múltiplos ambientes:**

```bash
# Branch de desenvolvimento
git checkout -b dev
git push -u origin dev

# Branch de staging
git checkout -b staging
git push -u origin staging

# Branch principal (produção)
git checkout main
```

### **Workflow:**
1. Desenvolver em `dev`
2. Testar em `staging`
3. Merge para `main` (produção)

---

## 🔄 Clonar Repositório em Outro Lugar

### **No servidor de produção:**

```bash
# HTTPS (público ou com token)
git clone https://github.com/SEU_USUARIO/sefaz-xml-sync.git

# SSH (configuração de chave SSH necessária)
git clone git@github.com:SEU_USUARIO/sefaz-xml-sync.git

# Entrar no diretório
cd sefaz-xml-sync

# Criar .env com valores de produção
cp .env.portainer .env
nano .env
```

---

## 📝 Comandos Git Úteis

```bash
# Ver histórico de commits
git log --oneline

# Ver alterações não commitadas
git diff

# Ver status
git status

# Desfazer alterações locais (cuidado!)
git checkout -- arquivo.txt

# Atualizar do GitHub
git pull

# Ver branches
git branch -a

# Trocar de branch
git checkout nome-da-branch

# Criar e trocar para nova branch
git checkout -b nova-branch

# Ver remotos configurados
git remote -v
```

---

## 🎯 Checklist Final

Antes de fazer push, verificar:

- [ ] `.gitignore` configurado corretamente
- [ ] `git status` não mostra arquivos sensíveis
- [ ] Arquivo `.env.example` (template) commitado
- [ ] Arquivos `.env*` reais NÃO commitados
- [ ] Certificados `.pfx` NÃO commitados
- [ ] XMLs NÃO commitados
- [ ] README.md e documentação atualizados
- [ ] Commit com mensagem descritiva

---

## 🎓 Recursos de Aprendizado

- **Git Basics:** https://git-scm.com/book/en/v2
- **GitHub Guides:** https://guides.github.com
- **Visual Git Guide:** https://marklodato.github.io/visual-git-guide/index-en.html
- **Oh My Git! (Jogo):** https://ohmygit.org

---

## 🆘 Problemas Comuns

### **"remote: Support for password authentication was removed"**

**Solução:** Use Personal Access Token em vez de senha

### **"Permission denied (publickey)"**

**Solução:** 
1. Use HTTPS em vez de SSH
2. **OU** configure chave SSH: https://docs.github.com/en/authentication/connecting-to-github-with-ssh

### **"! [rejected] main -> main (fetch first)"**

**Solução:**
```bash
git pull origin main --rebase
git push origin main
```

### **Arquivos sensíveis foram commitados**

**Se NÃO fez push ainda:**
```bash
git reset --soft HEAD~1
# Corrigir .gitignore e commitar novamente
```

**Se JÁ fez push:**
1. Gerar novos secrets
2. Deletar repositório e criar novo
3. Push novamente

---

## ✅ Conclusão

Agora seu código está no GitHub! 🎉

**Próximos passos:**
1. Fazer deploy via Portainer (seguir `DEPLOYMENT-PORTAINER.md`)
2. Configurar CI/CD (GitHub Actions - opcional)
3. Adicionar badges ao README
4. Configurar branch protection (main)

---

**Dúvidas?** Consulte a documentação oficial do Git ou GitHub.
