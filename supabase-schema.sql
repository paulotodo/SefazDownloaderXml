-- ============================================
-- SEFAZ XML Sync - Schema do Banco Supabase
-- ============================================
-- Execute este script no SQL Editor do Supabase Dashboard
-- Settings → SQL Editor → New Query → Cole este código → Run

-- 1. Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_graphql";

-- 2. Tabela de perfis de usuário (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  nome_completo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. Tabela de empresas
CREATE TABLE IF NOT EXISTS public.empresas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  cnpj TEXT NOT NULL,
  razao_social TEXT NOT NULL,
  uf TEXT NOT NULL,
  ambiente TEXT NOT NULL DEFAULT 'prod' CHECK (ambiente IN ('prod', 'hom')),
  certificado_path TEXT NOT NULL,
  certificado_senha TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true NOT NULL,
  ultimo_nsu TEXT DEFAULT '000000000000000' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, cnpj)
);

-- 4. Tabela de sincronizações
CREATE TABLE IF NOT EXISTS public.sincronizacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE NOT NULL,
  data_inicio TIMESTAMPTZ NOT NULL,
  data_fim TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('em_andamento', 'concluida', 'erro')),
  nsu_inicial TEXT NOT NULL,
  nsu_final TEXT,
  xmls_baixados INTEGER DEFAULT 0 NOT NULL,
  mensagem_erro TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 5. Tabela de XMLs
CREATE TABLE IF NOT EXISTS public.xmls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE NOT NULL,
  sincronizacao_id UUID REFERENCES public.sincronizacoes(id) ON DELETE SET NULL,
  chave_nfe TEXT NOT NULL,
  numero_nf TEXT NOT NULL,
  data_emissao TIMESTAMPTZ NOT NULL,
  caminho_arquivo TEXT NOT NULL,
  tamanho_bytes INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(empresa_id, chave_nfe)
);

-- 6. Tabela de logs
CREATE TABLE IF NOT EXISTS public.logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  sincronizacao_id UUID REFERENCES public.sincronizacoes(id) ON DELETE CASCADE,
  nivel TEXT NOT NULL CHECK (nivel IN ('info', 'warning', 'error')),
  mensagem TEXT NOT NULL,
  detalhes TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================
-- ÍNDICES para performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_empresas_user_id ON public.empresas(user_id);
CREATE INDEX IF NOT EXISTS idx_empresas_ativo ON public.empresas(ativo);
CREATE INDEX IF NOT EXISTS idx_sincronizacoes_user_id ON public.sincronizacoes(user_id);
CREATE INDEX IF NOT EXISTS idx_sincronizacoes_empresa_id ON public.sincronizacoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sincronizacoes_status ON public.sincronizacoes(status);
CREATE INDEX IF NOT EXISTS idx_xmls_user_id ON public.xmls(user_id);
CREATE INDEX IF NOT EXISTS idx_xmls_empresa_id ON public.xmls(empresa_id);
CREATE INDEX IF NOT EXISTS idx_xmls_data_emissao ON public.xmls(data_emissao);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON public.logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_nivel ON public.logs(nivel);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON public.logs(timestamp DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS) Policies
-- ============================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sincronizacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xmls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

-- Policies para PROFILES
CREATE POLICY "Usuários podem ver seu próprio perfil"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Usuários podem atualizar seu próprio perfil"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Usuários podem inserir seu próprio perfil"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Policies para EMPRESAS
CREATE POLICY "Usuários podem ver apenas suas empresas"
  ON public.empresas FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar suas próprias empresas"
  ON public.empresas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar suas próprias empresas"
  ON public.empresas FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar suas próprias empresas"
  ON public.empresas FOR DELETE
  USING (auth.uid() = user_id);

-- Policies para SINCRONIZAÇÕES
CREATE POLICY "Usuários podem ver apenas suas sincronizações"
  ON public.sincronizacoes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role pode inserir sincronizações"
  ON public.sincronizacoes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role pode atualizar sincronizações"
  ON public.sincronizacoes FOR UPDATE
  USING (true);

-- Policies para XMLs
CREATE POLICY "Usuários podem ver apenas seus XMLs"
  ON public.xmls FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role pode inserir XMLs"
  ON public.xmls FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Usuários podem deletar seus XMLs"
  ON public.xmls FOR DELETE
  USING (auth.uid() = user_id);

-- Policies para LOGS
CREATE POLICY "Usuários podem ver seus logs ou logs do sistema"
  ON public.logs FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Service role pode criar logs"
  ON public.logs FOR INSERT
  WITH CHECK (true);

-- ============================================
-- TRIGGERS para updated_at
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_empresas
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- TRIGGER para criar perfil automaticamente
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome_completo)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.raw_user_meta_data->>'nomeCompleto', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- CONCLUÍDO
-- ============================================
-- ✅ Execute este script completo no Supabase SQL Editor
-- ✅ Todas as tabelas, índices, RLS policies e triggers foram criados
-- ✅ Pronto para começar a usar!

SELECT 'Schema criado com sucesso! ✅' as status;
