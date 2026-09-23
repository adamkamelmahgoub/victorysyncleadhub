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
import { ALL_PAGE_PERMISSION_KEYS } from "./permissions";

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
    () => {
      const role = typeof session?.user?.user_metadata?.role === "string" ? session.user.user_metadata.role : "member";
      const clientAccountId = typeof session?.user?.user_metadata?.client_account_id === "string"
        ? session.user.user_metadata.client_account_id
        : null;
      const configuredPermissions = role === "owner"
        ? null
        : Array.isArray(session?.user?.user_metadata?.page_permissions)
          ? session.user.user_metadata.page_permissions.filter((permission): permission is string => typeof permission === "string")
          : null;
      const pagePermissions = clientAccountId
        ? (configuredPermissions ?? ALL_PAGE_PERMISSION_KEYS).filter((permission) => !["client-accounts", "team"].includes(permission))
        : configuredPermissions;

      return ({
      loading,
      session,
      user: session?.user ?? null,
      role,
      clientAccountId,
      pagePermissions,
      signOut: async () => {
        await recordActivity('authentication','signed_out',{pagePath:window.location.pathname});
        await supabase.auth.signOut();
      },
    });
    },
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
