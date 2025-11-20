-- ============================================================================
-- SEFAZ XML SYNC - SCHEMA COMPLETO PARA SUPABASE (PRODUÇÃO)
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Abra o Supabase Dashboard → SQL Editor
-- 2. Cole TODO este arquivo e execute (clique em "Run")
-- 3. Confirme que não há erros na saída
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABELA: profiles
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  nome_completo text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TABELA: empresas
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.empresas (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cnpj text NOT NULL,
  razao_social text NOT NULL,
  uf text NOT NULL,
  ambiente text NOT NULL DEFAULT 'prod',
  certificado_path text NOT NULL,
  certificado_senha text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ultimo_nsu text NOT NULL DEFAULT '000000000000000',
  bloqueado_ate timestamptz,
  tipo_armazenamento text NOT NULL DEFAULT 'local',
  manifestacao_automatica boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT empresas_user_cnpj_unique UNIQUE (user_id, cnpj)
);

-- Adicionar colunas se não existirem (para updates incrementais)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='empresas' AND column_name='tipo_armazenamento') THEN
    ALTER TABLE public.empresas ADD COLUMN tipo_armazenamento text NOT NULL DEFAULT 'local';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='empresas' AND column_name='manifestacao_automatica') THEN
    ALTER TABLE public.empresas ADD COLUMN manifestacao_automatica boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- ============================================================================
-- TABELA: sincronizacoes
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sincronizacoes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  data_inicio timestamptz NOT NULL,
  data_fim timestamptz,
  status text NOT NULL,
  nsu_inicial text NOT NULL,
  nsu_final text,
  xmls_baixados integer NOT NULL DEFAULT 0,
  mensagem_erro text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TABELA: xmls
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.xmls (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  sincronizacao_id uuid REFERENCES public.sincronizacoes(id) ON DELETE SET NULL,
  chave_nfe text NOT NULL,
  numero_nf text NOT NULL,
  modelo text NOT NULL DEFAULT '55',
  tipo_documento text NOT NULL DEFAULT 'nfeProc',
  data_emissao timestamptz NOT NULL,
  caminho_arquivo text NOT NULL,
  tamanho_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT xmls_user_chave_unique UNIQUE (user_id, chave_nfe)
);

-- ============================================================================
-- TABELA: logs
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  sincronizacao_id uuid REFERENCES public.sincronizacoes(id) ON DELETE CASCADE,
  nivel text NOT NULL,
  mensagem text NOT NULL,
  detalhes text,
  timestamp timestamptz NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TABELA: manifestacoes
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.manifestacoes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  chave_nfe text NOT NULL,
  tipo_evento text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  data_autorizacao_nfe timestamptz NOT NULL,
  data_manifestacao timestamptz,
  prazo_legal timestamptz NOT NULL,
  nsu_evento text,
  protocolo_evento text,
  c_stat text,
  x_motivo text,
  justificativa text,
  tentativas integer NOT NULL DEFAULT 0,
  ultimo_erro text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT manifestacoes_user_chave_unique UNIQUE (user_id, chave_nfe)
);

-- ============================================================================
-- TABELA: configuracoes
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.configuracoes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  intervalo_sincronizacao text NOT NULL DEFAULT '1h',
  sincronizacao_automatica boolean NOT NULL DEFAULT true,
  sincronizar_ao_iniciar boolean NOT NULL DEFAULT true,
  retry_automatico boolean NOT NULL DEFAULT true,
  max_retries integer NOT NULL DEFAULT 3,
  timeout_requisicao integer NOT NULL DEFAULT 60,
  validar_ssl boolean NOT NULL DEFAULT true,
  logs_detalhados boolean NOT NULL DEFAULT false,
  notificar_novos_xmls boolean NOT NULL DEFAULT true,
  notificar_erros boolean NOT NULL DEFAULT true,
  relatorio_diario boolean NOT NULL DEFAULT false,
  email_notificacoes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sincronizacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xmls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manifestacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

-- Políticas para profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Políticas para empresas
DROP POLICY IF EXISTS "Users can view own empresas" ON public.empresas;
CREATE POLICY "Users can view own empresas" ON public.empresas
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own empresas" ON public.empresas;
CREATE POLICY "Users can insert own empresas" ON public.empresas
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own empresas" ON public.empresas;
CREATE POLICY "Users can update own empresas" ON public.empresas
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own empresas" ON public.empresas;
CREATE POLICY "Users can delete own empresas" ON public.empresas
  FOR DELETE USING (auth.uid() = user_id);

-- Políticas para sincronizacoes
DROP POLICY IF EXISTS "Users can view own sincronizacoes" ON public.sincronizacoes;
CREATE POLICY "Users can view own sincronizacoes" ON public.sincronizacoes
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own sincronizacoes" ON public.sincronizacoes;
CREATE POLICY "Users can insert own sincronizacoes" ON public.sincronizacoes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own sincronizacoes" ON public.sincronizacoes;
CREATE POLICY "Users can update own sincronizacoes" ON public.sincronizacoes
  FOR UPDATE USING (auth.uid() = user_id);

-- Políticas para xmls
DROP POLICY IF EXISTS "Users can view own xmls" ON public.xmls;
CREATE POLICY "Users can view own xmls" ON public.xmls
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own xmls" ON public.xmls;
CREATE POLICY "Users can insert own xmls" ON public.xmls
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own xmls" ON public.xmls;
CREATE POLICY "Users can update own xmls" ON public.xmls
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own xmls" ON public.xmls;
CREATE POLICY "Users can delete own xmls" ON public.xmls
  FOR DELETE USING (auth.uid() = user_id);

-- Políticas para logs
DROP POLICY IF EXISTS "Users can view own logs" ON public.logs;
CREATE POLICY "Users can view own logs" ON public.logs
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can insert own logs" ON public.logs;
CREATE POLICY "Users can insert own logs" ON public.logs
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Políticas para manifestacoes
DROP POLICY IF EXISTS "Users can view own manifestacoes" ON public.manifestacoes;
CREATE POLICY "Users can view own manifestacoes" ON public.manifestacoes
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own manifestacoes" ON public.manifestacoes;
CREATE POLICY "Users can insert own manifestacoes" ON public.manifestacoes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own manifestacoes" ON public.manifestacoes;
CREATE POLICY "Users can update own manifestacoes" ON public.manifestacoes
  FOR UPDATE USING (auth.uid() = user_id);

-- Políticas para configuracoes
DROP POLICY IF EXISTS "Users can view own configuracoes" ON public.configuracoes;
CREATE POLICY "Users can view own configuracoes" ON public.configuracoes
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own configuracoes" ON public.configuracoes;
CREATE POLICY "Users can insert own configuracoes" ON public.configuracoes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own configuracoes" ON public.configuracoes;
CREATE POLICY "Users can update own configuracoes" ON public.configuracoes
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_empresas_user_id ON public.empresas(user_id);
CREATE INDEX IF NOT EXISTS idx_sincronizacoes_user_id ON public.sincronizacoes(user_id);
CREATE INDEX IF NOT EXISTS idx_sincronizacoes_empresa_id ON public.sincronizacoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_xmls_user_id ON public.xmls(user_id);
CREATE INDEX IF NOT EXISTS idx_xmls_empresa_id ON public.xmls(empresa_id);
CREATE INDEX IF NOT EXISTS idx_xmls_chave_nfe ON public.xmls(chave_nfe);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON public.logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_empresa_id ON public.logs(empresa_id);
CREATE INDEX IF NOT EXISTS idx_manifestacoes_user_id ON public.manifestacoes(user_id);
CREATE INDEX IF NOT EXISTS idx_manifestacoes_empresa_id ON public.manifestacoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_manifestacoes_chave_nfe ON public.manifestacoes(chave_nfe);
CREATE INDEX IF NOT EXISTS idx_configuracoes_user_id ON public.configuracoes(user_id);

-- ============================================================================
-- TRIGGERS PARA updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_empresas_updated_at ON public.empresas;
CREATE TRIGGER update_empresas_updated_at
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_manifestacoes_updated_at ON public.manifestacoes;
CREATE TRIGGER update_manifestacoes_updated_at
  BEFORE UPDATE ON public.manifestacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_configuracoes_updated_at ON public.configuracoes;
CREATE TRIGGER update_configuracoes_updated_at
  BEFORE UPDATE ON public.configuracoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- VALIDAÇÃO FINAL
-- ============================================================================

-- Lista todas as tabelas criadas
SELECT 'Tabelas criadas:' as resultado, table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Verifica colunas críticas em empresas
SELECT 'Colunas empresas:' as resultado, column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_schema='public' 
  AND table_name='empresas' 
  AND column_name IN ('tipo_armazenamento', 'manifestacao_automatica')
ORDER BY column_name;

-- ============================================================================
-- FIM DO SCRIPT - Se chegou aqui sem erros, está tudo correto!
-- ============================================================================
