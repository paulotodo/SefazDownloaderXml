# ⚡ Comandos Git - Guia Rápido

## 🎯 Subir Código para GitHub (Primeira Vez)

### 1️⃣ Criar Repositório no GitHub
1. Acesse: https://github.com
2. Clique no **+** → **New repository**
3. Nome: `sefaz-xml-sync`
4. **Private** (recomendado)
5. **Create repository**
6. Copie a URL: `https://github.com/SEU_USUARIO/sefaz-xml-sync.git`

### 2️⃣ No Terminal do Replit

```bash
# Configurar Git (primeira vez)
git config --global user.name "Seu Nome"
git config --global user.email "seu-email@example.com"

# Inicializar repositório (se necessário)
git init

# Adicionar todos os arquivos
git add .

# Ver o que será commitado (verificar se não tem .env!)
git status

# Criar commit inicial
git commit -m "feat: sistema completo SEFAZ XML Sync"

# Conectar ao GitHub (SUBSTITUA SEU_USUARIO!)
git remote add origin https://github.com/SEU_USUARIO/sefaz-xml-sync.git

# Renomear branch para main
git branch -M main

# Enviar para GitHub
git push -u origin main
```

**Se pedir senha:**
- Username: seu-usuario-github
- Password: USE UM **TOKEN** (não a senha!) → [Como criar token](#criar-token)

---

## 🔑 Criar Token do GitHub

**Se o push pedir senha e falhar:**

1. GitHub → **Settings** (seu perfil, canto superior direito)
2. **Developer settings** (menu lateral, final)
3. **Personal access tokens** → **Tokens (classic)**
4. **Generate new token (classic)**
5. Configurar:
   - Note: `Replit SEFAZ`
   - Expiration: `90 days`
   - Marcar: **repo** (todos os subitens)
6. **Generate token**
7. **COPIAR O TOKEN** (não será mostrado de novo!)

**Fazer push novamente:**
```bash
git push -u origin main
# Username: seu-usuario
# Password: COLAR-O-TOKEN-AQUI
```

---

## 🔄 Atualizar Código no GitHub (Depois da Primeira Vez)

```bash
# Verificar alterações
git status

# Adicionar arquivos modificados
git add .

# Criar commit
git commit -m "descrição da mudança"

# Enviar para GitHub
git push
```

---

## 📝 Mensagens de Commit

**Exemplos:**
```bash
git commit -m "feat: adicionar exportação de XMLs"
git commit -m "fix: corrigir bug na sincronização"
git commit -m "docs: atualizar README"
git commit -m "refactor: melhorar performance"
```

---

## 🔍 Verificar Status

```bash
# Ver alterações
git status

# Ver histórico
git log --oneline

# Ver diferenças
git diff
```

---

## ⚠️ Arquivos a NUNCA Commitar

O `.gitignore` já está configurado para bloquear:
- ❌ `.env*` (secrets)
- ❌ `certificados/` (.pfx)
- ❌ `xmls/` (dados)
- ❌ `node_modules/`

**Verificar antes de commitar:**
```bash
git status

# NÃO deve aparecer:
# - .env
# - certificados/
# - xmls/
# - node_modules/
```

---

## 🆘 Ajuda Rápida

### Desfazer último commit (antes de push)
```bash
git reset --soft HEAD~1
```

### Remover arquivo do staging
```bash
git reset HEAD arquivo.txt
```

### Desfazer alterações em arquivo
```bash
git checkout -- arquivo.txt
```

### Atualizar do GitHub
```bash
git pull
```

---

## ✅ Checklist Antes de Push

- [ ] `git status` não mostra `.env`
- [ ] `git status` não mostra `certificados/`
- [ ] `git status` não mostra `xmls/`
- [ ] Commit com mensagem clara
- [ ] Código funcional

---

## 🚀 Próximo Passo

**Após fazer push, fazer deploy:**
```bash
# Ver guia completo
cat DEPLOYMENT-PORTAINER.md
```

---

**Dúvidas?** Ver guia completo: `GIT-SETUP.md`
