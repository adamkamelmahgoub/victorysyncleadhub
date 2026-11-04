import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Login() {
  const { session } = useAuth();
  const inviteParams = new URLSearchParams(window.location.search);
  const [name, setName] = useState(inviteParams.get("name") ?? "");
  const [email, setEmail] = useState(inviteParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(inviteParams.get("invite") ?? "");
  const [mode, setMode] = useState<"signin" | "signup">(
    inviteParams.has("invite") ? "signup" : "signin",
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (session) return null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (mode === "signup") {
      const signupRes = await fetch(`${BASE}/api/auth/signup-with-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, inviteCode }),
      });

      if (!signupRes.ok) {
        setLoading(false);
        const text = await signupRes.text().catch(() => "");
        try {
          const parsed = JSON.parse(text);
          setError(parsed.error ?? parsed.message ?? text);
        } catch {
          setError(text || `HTTP ${signupRes.status}`);
        }
        return;
      }

      setMessage("Account created. Signing you in...");
    }

    const result = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    if (mode === "signup" && !result.data.session) setMessage("Account created. Please sign in.");
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white border border-border rounded-lg shadow-sm p-6 space-y-4"
      >
        <div>
          <h1 className="text-xl font-semibold text-foreground">VictorySync</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "signin" ? "Sign in to your workspace." : "Create your account with an admin invite."}
          </p>
        </div>

        {mode === "signup" && (
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="name">
              Full name
            </label>
            <Input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="password">
            Password
          </label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        {mode === "signup" && (
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="invite-code">
              Invite code
            </label>
            <Input
              id="invite-code"
              type="text"
              autoComplete="one-time-code"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              required
            />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm text-muted-foreground">{message}</p>}

        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
        </Button>

        <button
          type="button"
          className="w-full text-sm text-muted-foreground hover:text-foreground"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setMessage(null);
          }}
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}
