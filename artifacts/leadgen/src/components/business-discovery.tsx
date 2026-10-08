import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type Place = { place_id: string; name: string; phone?: string; website?: string;
  category?: string; address?: { formatted?: string; locality?: string; region?: string };
  already_saved?: boolean };

export function BusinessDiscovery() {
  const { toast } = useToast();
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [radius, setRadius] = useState(25);
  const [places, setPlaces] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [calls, setCalls] = useState(0);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function discover() {
    setBusy(true); setError(""); setSearched(false); setPlaces([]); setSelected(new Set());
    try {
      const result = await apiFetch("/api/enrichment?action=discover", { method: "POST",
        body: JSON.stringify({ city: city.trim(), state: state.trim(), radius_mi: radius, pages: 2 }) }) as
        { places: Place[]; api_calls: number };
      setPlaces(result.places || []); setCalls(result.api_calls || 0); setSearched(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Search failed"); }
    finally { setBusy(false); }
  }

  async function save() {
    const chosen = places.filter((place) => selected.has(place.place_id) && !place.already_saved);
    if (!chosen.length) return;
    setBusy(true); setError("");
    try {
      const result = await apiFetch("/api/enrichment?action=import_places", { method: "POST",
        body: JSON.stringify({ city: city.trim(), state: state.trim(), radius_mi: radius, places: chosen }) }) as
        { inserted: number; skipped: number };
      toast({ title: `${result.inserted} businesses added to leads`,
        description: result.skipped ? `${result.skipped} skipped as duplicates or suppressed` : undefined });
      setPlaces((current) => current.map((place) => selected.has(place.place_id)
        ? { ...place, already_saved: true } : place));
      setSelected(new Set());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import failed"); }
    finally { setBusy(false); }
  }

  const available = places.filter((place) => place.phone && !place.already_saved);
  return <section className="workspace-panel p-4 space-y-4">
    <div>
      <h2 className="font-semibold">Find plumbing and HVAC businesses</h2>
      <p className="text-sm text-muted-foreground">Search Open Places / Overture listings near a US city. Existing and suppressed numbers are skipped.</p>
    </div>
    <div className="flex flex-wrap gap-2 items-end">
      <label className="text-xs flex-1 min-w-36">City<Input aria-label="City" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Tulsa" /></label>
      <label className="text-xs w-24">State<Input aria-label="State" value={state} onChange={(event) => setState(event.target.value)} placeholder="OK" maxLength={40} /></label>
      <label className="text-xs w-28">Radius, miles<Input aria-label="Radius in miles" type="number" min={1} max={50} value={radius} onChange={(event) => setRadius(Number(event.target.value))} /></label>
      <Button onClick={discover} disabled={busy || !city.trim() || !state.trim() || radius < 1 || radius > 50}>{busy ? "Working..." : "Find businesses"}</Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {searched && !places.length && <p className="text-sm text-muted-foreground">No business listings with phone numbers were found in this area. Try a larger radius or nearby city.</p>}
    {places.length > 0 && <>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>{places.length} listings found, {available.length} available, {calls} Open Places calls</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setSelected(new Set(available.map((place) => place.place_id)))}>Select available</Button>
          <Button size="sm" onClick={save} disabled={busy || !selected.size}>Add {selected.size} to leads</Button>
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto divide-y">
        {places.map((place) => <label key={place.place_id} className="flex items-center gap-3 py-2 text-sm">
          <input type="checkbox" disabled={!place.phone || place.already_saved} checked={selected.has(place.place_id)}
            onChange={() => setSelected((before) => { const next = new Set(before); next.has(place.place_id) ? next.delete(place.place_id) : next.add(place.place_id); return next; })} />
          <span className="flex-1"><strong>{place.name}</strong><span className="block text-xs text-muted-foreground">{place.address?.formatted || [place.address?.locality, place.address?.region].filter(Boolean).join(", ")} · {place.phone || "No phone"} · {place.category || "Business"}</span></span>
          {place.already_saved && <span className="text-xs text-muted-foreground">In CRM or suppressed</span>}
          {place.website && <a className="text-xs underline" href={place.website} target="_blank" rel="noreferrer">Website</a>}
        </label>)}
      </div>
      <p className="text-xs text-muted-foreground">Business listings from <a className="underline" href="https://openplacesapi.com/data-rights" target="_blank" rel="noreferrer">Open Places API</a> and <a className="underline" href="https://overturemaps.org/" target="_blank" rel="noreferrer">Overture Maps Foundation</a>.</p>
    </>}
  </section>;
}
