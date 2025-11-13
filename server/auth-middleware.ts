import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "./supabase";

// Estende a interface Request do Express para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        [key: string]: any;
      };
      accessToken?: string;
    }
  }
}

// Middleware para validar JWT e autenticar usuário
export async function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Extrai token do header Authorization
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1]; // "Bearer <token>"

    if (!token) {
      return res.status(401).json({ error: "Token de autenticação não fornecido" });
    }

    // Valida token com Supabase (usando service role para validação server-side)
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(403).json({ error: "Token inválido ou expirado" });
    }

    // Anexa usuário e token à requisição
    req.user = {
      id: user.id,
      email: user.email || "",
      ...user.user_metadata,
    };
    req.accessToken = token;

    next();
  } catch (error) {
    console.error("Erro no middleware de autenticação:", error);
    return res.status(500).json({ error: "Erro ao validar autenticação" });
  }
}

// Middleware opcional - permite requisições sem autenticação mas anexa usuário se presente
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (token) {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

      if (!error && user) {
        req.user = {
          id: user.id,
          email: user.email || "",
          ...user.user_metadata,
        };
        req.accessToken = token;
      }
    }

    next();
  } catch (error) {
    // Em caso de erro, apenas continua sem usuário
    next();
  }
}
