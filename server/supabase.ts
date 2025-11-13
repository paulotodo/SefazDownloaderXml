import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Validar variáveis de ambiente
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  throw new Error(
    "Faltam variáveis de ambiente do Supabase: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY"
  );
}

// Cliente público (com RLS - respects Row Level Security)
// Usado para operações do lado do servidor que precisam respeitar RLS
export const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // Não persiste sessão no servidor
    autoRefreshToken: false, // Cliente gerencia refresh
  },
});

// Cliente admin (bypassa RLS - para sincronizações automáticas)
// Usado apenas para operações do sistema (cron jobs, etc)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Cria cliente Supabase com token de usuário específico
// Usado para operações que precisam de contexto de usuário autenticado
export function createUserSupabaseClient(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

console.log("✓ Supabase configurado com sucesso");
