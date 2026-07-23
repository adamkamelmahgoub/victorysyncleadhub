import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { supabase } from "./supabase";

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  role: string;
  clientAccountId: string | null;
  pagePermissions: string[] | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let mounted = true;
    const establishDashboardSession = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
        url.searchParams.delete("code");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      } else if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        window.history.replaceState({}, "", `${url.pathname}${url.search}`);
      }
    };
    setAuthTokenGetter(async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    });

    establishDashboardSession().then(() => supabase.auth.getSession()).then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      setAuthTokenGetter(null);
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      role: typeof session?.user?.user_metadata?.role === "string" ? session.user.user_metadata.role : "member",
      clientAccountId: typeof session?.user?.user_metadata?.client_account_id === "string"
        ? session.user.user_metadata.client_account_id
        : null,
      pagePermissions: session?.user?.user_metadata?.role === "owner"
        ? null
        : Array.isArray(session?.user?.user_metadata?.page_permissions)
        ? session.user.user_metadata.page_permissions.filter((value): value is string => typeof value === "string")
        : null,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
