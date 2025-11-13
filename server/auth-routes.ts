import { Router, Request, Response } from "express";
import { supabaseAnon, supabaseAdmin } from "./supabase";
import { registerSchema, loginSchema } from "@shared/schema";
import { authenticateUser } from "./auth-middleware";
import { z } from "zod";

const router = Router();

// Endpoint de teste para verificar conexão Supabase
router.get("/test-connection", async (req: Request, res: Response) => {
  try {
    // Testa com anon key
    const { data: anonData, error: anonError } = await supabaseAnon.auth.getSession();
    
    // Testa com admin key
    const { data: adminData, error: adminError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    
    res.json({
      anonKey: {
        works: !anonError,
        error: anonError?.message
      },
      adminKey: {
        works: !adminError,
        error: adminError?.message,
        userCount: adminData?.users?.length || 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/auth/register - Registrar novo usuário
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, nomeCompleto } = registerSchema.parse(req.body);

    // Criar usuário no Supabase Auth
    const { data, error } = await supabaseAnon.auth.signUp({
      email,
      password,
      options: {
        data: {
          nomeCompleto,
        },
      },
    });

    if (error) {
      console.error("Erro no registro - Supabase:", error);
      
      // Trata rate limiting de envio de emails
      if (error.status === 429 || error.message.includes("rate limit")) {
        return res.status(429).json({ 
          error: "Muitas tentativas de registro. Por favor, aguarde alguns minutos antes de tentar novamente.",
          retryAfter: 60 // sugestão de espera em segundos
        });
      }
      
      // Supabase pode rejeitar emails de domínios de teste (example.com, etc)
      // ou exigir confirmação de email dependendo das configurações do projeto
      return res.status(400).json({ error: error.message });
    }

    // Debug: log completo da resposta do Supabase
    console.log("=== REGISTRO SUPABASE DEBUG ===");
    console.log("Email tentado:", email);
    console.log("Tem user?", !!data.user);
    console.log("Tem session?", !!data.session);
    console.log("User ID:", data.user?.id);
    console.log("User email:", data.user?.email);
    console.log("User confirmado?", data.user?.email_confirmed_at);
    console.log("===============================");

    if (!data.user) {
      console.error("❌ ERRO: Supabase não retornou user após signUp");
      return res.status(400).json({ error: "Erro ao criar usuário no Supabase. Verifique as configurações de autenticação." });
    }

    if (!data.session) {
      console.warn("⚠️ AVISO: Usuário criado mas sem sessão ativa");
      console.warn("Isso indica que confirmação de email está habilitada no Supabase");
      return res.status(400).json({ 
        error: "Conta criada! Por favor, verifique seu email para confirmar o cadastro antes de fazer login.",
        requiresEmailConfirmation: true 
      });
    }

    // Valida token com service role para garantir que funcionará no middleware
    const { data: validatedUser, error: validateError } = await supabaseAdmin.auth.getUser(data.session.access_token);
    
    if (validateError || !validatedUser.user) {
      console.error("Erro ao validar token após registro:", validateError);
      return res.status(500).json({ error: "Erro ao validar token de autenticação" });
    }

    res.status(201).json({
      user: {
        id: data.user.id,
        email: data.user.email,
        nomeCompleto,
      },
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Erro no registro:", error);
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/auth/login - Login de usuário
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("Erro no login - Supabase:", error);
      return res.status(401).json({ error: "Email ou senha incorretos" });
    }

    if (!data.user || !data.session) {
      return res.status(401).json({ error: "Erro ao fazer login" });
    }

    // Valida token com service role para garantir que funcionará no middleware
    const { data: validatedUser, error: validateError } = await supabaseAdmin.auth.getUser(data.session.access_token);
    
    if (validateError || !validatedUser.user) {
      console.error("Erro ao validar token após login:", validateError);
      return res.status(500).json({ error: "Erro ao validar token de autenticação" });
    }

    res.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        nomeCompleto: data.user.user_metadata?.nomeCompleto,
      },
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Erro no login:", error);
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/auth/logout - Logout de usuário
router.post("/logout", authenticateUser, async (req: Request, res: Response) => {
  try {
    // Em vez de signOut() inefetivo em servidor stateless,
    // apenas instrui cliente a descartar tokens localmente
    // Em produção, considerar revogar refresh tokens: supabaseAdmin.auth.admin.deleteUser(req.user!.id)
    
    res.json({ message: "Logout realizado com sucesso" });
  } catch (error) {
    console.error("Erro no logout:", error);
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/auth/me - Obter usuário atual
router.get("/me", authenticateUser, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        nomeCompleto: req.user.nomeCompleto,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar usuário:", error);
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/auth/refresh - Renovar token
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ error: "Refresh token não fornecido" });
    }

    const { data, error } = await supabaseAnon.auth.refreshSession({
      refresh_token,
    });

    if (error || !data.session) {
      return res.status(401).json({ error: "Refresh token inválido" });
    }

    // Valida token com service role para garantir que funcionará no middleware
    const { data: validatedUser, error: validateError } = await supabaseAdmin.auth.getUser(data.session.access_token);
    
    if (validateError || !validatedUser.user) {
      console.error("Erro ao validar token após refresh:", validateError);
      return res.status(401).json({ error: "Erro ao validar token renovado" });
    }

    res.json({
      user: {
        id: validatedUser.user.id,
        email: validatedUser.user.email,
        nomeCompleto: validatedUser.user.user_metadata?.nomeCompleto,
      },
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    });
  } catch (error) {
    console.error("Erro ao renovar token:", error);
    res.status(500).json({ error: String(error) });
  }
});

export default router;
