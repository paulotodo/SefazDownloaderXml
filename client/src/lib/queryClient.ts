import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest<T = any>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  // Busca token do localStorage (apenas no browser)
  const sessionStr = typeof window !== 'undefined' ? localStorage.getItem("session") : null;
  
  // Detecta se o body é FormData para não sobrescrever Content-Type
  const isFormData = options?.body instanceof FormData;
  
  let headers: Record<string, string> = {
    ...(!isFormData && { "Content-Type": "application/json" }),
    ...options?.headers as Record<string, string>,
  };

  if (sessionStr) {
    try {
      const session = JSON.parse(sessionStr);
      if (session.accessToken) {
        headers["Authorization"] = `Bearer ${session.accessToken}`;
      }
    } catch (error) {
      console.error("Erro ao parsear sessão:", error);
    }
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  
  // Se não tiver body (204 No Content), retorna objeto vazio
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return {} as T;
  }
  
  return res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Busca token do localStorage (apenas no browser)
    const sessionStr = typeof window !== 'undefined' ? localStorage.getItem("session") : null;
    let headers: Record<string, string> = {};

    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        if (session.accessToken) {
          headers["Authorization"] = `Bearer ${session.accessToken}`;
        }
      } catch (error) {
        console.error("Erro ao parsear sessão:", error);
      }
    }

    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
