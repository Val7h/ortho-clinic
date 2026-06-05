"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: "superadmin" | "admin" | "doctor" | "secretary";
  organization_id: number;
  active: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isDoctor: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "ortho_token";
const USER_KEY = "ortho_user";

function readStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function readStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const storedUser = readStoredUser();
    const storedToken = readStoredToken();
    if (storedUser && storedToken) {
      // Set Authorization header synchronously so the first API call is authenticated
      api.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`;
    }
    return storedUser;
  });
  const [loading, setLoading] = useState(() => {
    // If we already have a user from localStorage, skip the loading state
    if (typeof window === "undefined") return true;
    const hasToken = !!localStorage.getItem(TOKEN_KEY);
    const hasUser = !!localStorage.getItem(USER_KEY);
    return !(hasToken && hasUser);
  });
  const router = useRouter();

  // Only needed to handle edge cases (e.g. token present but user missing, or invalid JSON)
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const raw = localStorage.getItem(USER_KEY);
    if (token && raw) {
      try {
        const u: AuthUser = JSON.parse(raw);
        setUser(u);
        api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post("/auth/login", { email, password });
    const { access_token, user: u } = res.data;
    localStorage.setItem(TOKEN_KEY, access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    api.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;
    setUser(u);
    router.push("/");
  }, [router]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    delete api.defaults.headers.common["Authorization"];
    setUser(null);
    router.push("/login");
  }, [router]);

  const isDoctor = user?.role === "doctor" || user?.role === "admin" || user?.role === "superadmin";
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const isSuperAdmin = user?.role === "superadmin";

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isDoctor, isAdmin, isSuperAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Use in every protected page: redirects to /login if not authenticated. */
export function useProtectedPage() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.loading && !auth.user) {
      router.push("/login");
    }
  }, [auth.loading, auth.user, router]);

  return auth;
}
