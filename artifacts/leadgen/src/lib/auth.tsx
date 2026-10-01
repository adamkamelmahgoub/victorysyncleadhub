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
import {recordActivity} from './activity';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  role: string;
  clientAccountId: string | null;
  pagePermissions: string[] | null;
  signOut: () => Promise<void>;
};

function sessionClaims(session: Session | null): Record<string, unknown> {
  try {
    const encoded = session?.access_token.split(".")[1];
    return encoded ? JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown> : {};
  } catch { return {}; }
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let mounted = true;
    const synchronizedUsers = new Set<string>();
    const syncDashboardMember = async (nextSession: Session | null) => {
      if (!nextSession || synchronizedUsers.has(nextSession.user.id)) return;
      synchronizedUsers.add(nextSession.user.id);
      const response = await fetch(`${BASE}/api/auth/sync-session`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${nextSession.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ orgId: window.sessionStorage.getItem("victorysync_org_id") }),
      });
      if (!response.ok) {
        synchronizedUsers.delete(nextSession.user.id);
        const message = await response.text().catch(() => "");
        console.warn("Dashboard team synchronization failed", message || response.status);
      }
    };
    const establishDashboardSession = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token") ?? url.searchParams.get("access_token");
      const refreshToken = hash.get("refresh_token") ?? url.searchParams.get("refresh_token");
      const orgId = hash.get("org_id") ?? url.searchParams.get("org_id");
      if (orgId) window.sessionStorage.setItem("victorysync_org_id", orgId);
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
        url.searchParams.delete("code");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      } else if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        url.searchParams.delete("access_token");
        url.searchParams.delete("refresh_token");
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
      void syncDashboardMember(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      void syncDashboardMember(nextSession);
    });

    return () => {
      mounted = false;
      setAuthTokenGetter(null);
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => { const claims = sessionClaims(session); const role = typeof claims.crm_role === "string" && ["owner", "admin", "agent", "member", "viewer", "client"].includes(claims.crm_role) ? claims.crm_role : "no_access"; return ({
      loading,
      session,
      user: session?.user ?? null,
      role,
      clientAccountId: typeof claims.crm_client_account_id === "string" ? claims.crm_client_account_id : typeof session?.user?.user_metadata?.client_account_id === "string"
        ? session.user.user_metadata.client_account_id
        : null,
      pagePermissions: role === "client" || role === "agent" ? ["contacts", "pipeline"] : role === "owner"
        ? null
        : Array.isArray(claims.crm_page_permissions)
        ? claims.crm_page_permissions.filter((entry): entry is string => typeof entry === "string")
        : Array.isArray(session?.user?.user_metadata?.page_permissions)
        ? session.user.user_metadata.page_permissions.filter((value): value is string => typeof value === "string")
        : null,
      signOut: async () => {
        await recordActivity('authentication','signed_out',{pagePath:window.location.pathname});
        await supabase.auth.signOut();
      },
    }); },
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
