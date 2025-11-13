import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { apiRequest } from "@/lib/queryClient";

interface User {
  id: string;
  email: string;
  nomeCompleto: string;
}

interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nomeCompleto: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Carrega sessão do localStorage na inicialização
  useEffect(() => {
    const loadSession = async () => {
      if (typeof window === 'undefined') {
        setIsLoading(false);
        return;
      }
      
      const storedSession = localStorage.getItem("session");
      const storedUser = localStorage.getItem("user");
      
      if (storedSession) {
        try {
          const parsedSession: Session = JSON.parse(storedSession);
          
          // Verifica se token expirou
          if (parsedSession.expiresAt * 1000 < Date.now()) {
            // Token expirado, tenta renovar
            await refreshSession(parsedSession.refreshToken);
          } else {
            setSession(parsedSession);
            
            // Carrega usuário salvo ou busca novamente
            if (storedUser) {
              setUser(JSON.parse(storedUser));
            } else {
              // Garante que session está no localStorage antes de fetchUser
              // para que queryClient possa injetar o token
              localStorage.setItem("session", JSON.stringify(parsedSession));
              await fetchUser();
            }
          }
        } catch (error) {
          console.error("Erro ao carregar sessão:", error);
          if (typeof window !== 'undefined') {
            localStorage.removeItem("session");
            localStorage.removeItem("user");
          }
        }
      }
      setIsLoading(false);
    };

    loadSession();
  }, []);

  const refreshSession = async (refreshToken: string) => {
    try {
      const response = await apiRequest<{ user: User; accessToken: string; refreshToken: string; expiresAt: number }>("/api/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      
      const newSession: Session = {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        expiresAt: response.expiresAt,
      };
      
      setSession(newSession);
      setUser(response.user);
      if (typeof window !== 'undefined') {
        localStorage.setItem("session", JSON.stringify(newSession));
        localStorage.setItem("user", JSON.stringify(response.user));
      }
    } catch (error) {
      console.error("Erro ao renovar sessão:", error);
      if (typeof window !== 'undefined') {
        localStorage.removeItem("session");
        localStorage.removeItem("user");
      }
      setSession(null);
      setUser(null);
    }
  };

  const fetchUser = async () => {
    try {
      const response = await apiRequest<{ user: User }>("/api/auth/me");
      setUser(response.user);
      if (typeof window !== 'undefined') {
        localStorage.setItem("user", JSON.stringify(response.user));
      }
    } catch (error) {
      console.error("Erro ao buscar usuário:", error);
      setUser(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem("user");
      }
    }
  };

  const login = async (email: string, password: string) => {
    const response = await apiRequest<{ user: User; accessToken: string; refreshToken: string; expiresAt: number }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    const newSession: Session = {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresAt: response.expiresAt,
    };

    setUser(response.user);
    setSession(newSession);
    if (typeof window !== 'undefined') {
      localStorage.setItem("session", JSON.stringify(newSession));
      localStorage.setItem("user", JSON.stringify(response.user));
    }
  };

  const register = async (email: string, password: string, nomeCompleto: string) => {
    const response = await apiRequest<{ user: User; accessToken: string; refreshToken: string; expiresAt: number }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, nomeCompleto }),
    });

    const newSession: Session = {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresAt: response.expiresAt,
    };

    setUser(response.user);
    setSession(newSession);
    if (typeof window !== 'undefined') {
      localStorage.setItem("session", JSON.stringify(newSession));
      localStorage.setItem("user", JSON.stringify(response.user));
    }
  };

  const logout = async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    } finally {
      setUser(null);
      setSession(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem("session");
        localStorage.removeItem("user");
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Hook para obter token para fazer requests autenticados
export function useAuthToken() {
  const { session } = useAuth();
  return session?.accessToken || null;
}
