import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export type EnrichmentProvider = "open_places" | "google_places";
const valid = (value: unknown): value is EnrichmentProvider =>
  value === "open_places" || value === "google_places";

export function useEnrichmentPreference() {
  const { user } = useAuth();
  const accountPreference = user?.user_metadata?.enrichment_provider;
  const [provider, setProvider] = useState<EnrichmentProvider>(
    valid(accountPreference) ? accountPreference : "open_places",
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (valid(accountPreference)) setProvider(accountPreference);
  }, [accountPreference]);
  async function save() {
    setSaving(true); setSaved(false); setError("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        data: { enrichment_provider: provider },
      });
      if (updateError) throw updateError;
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save preference");
    } finally { setSaving(false); }
  }
  return { provider, setProvider: (next: EnrichmentProvider) => {
    setProvider(next); setSaved(false); setError("");
  }, save, saving, saved, error };
}
