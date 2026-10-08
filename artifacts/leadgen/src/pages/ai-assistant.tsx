import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { loadAssistantProfile, saveAssistantProfile, type AssistantProfile } from "@/lib/assistant-profile";

type Message = { role: "user" | "assistant"; content: string };
const suggestions = [
  "Write a cold email offering VictorySync appointment setting to a plumbing company",
  "Give me three opening lines about missed-call follow-up",
  "Show my overdue CRM tasks and suggest what to do first",
  "Summarize my pipeline and flag deals needing attention",
];
export default function AiAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<AssistantProfile>(() => loadAssistantProfile());
  const [profileSaved, setProfileSaved] = useState(false);
  async function submit(value = draft) {
    const prompt = value.trim();
    if (!prompt || busy) return;
    const next: Message[] = [...messages.slice(-10), { role: "user", content: prompt }];
    setMessages(next);
    setDraft(""); setBusy(true); setError("");
    try {
      const result = await apiFetch("/api/assistant", { method: "POST", body: JSON.stringify({ messages: next, seller_context: profile }) }) as { answer: string };
      setMessages([...next, { role: "assistant", content: result.answer }]);
    } catch (err) { setError(err instanceof Error ? err.message : "The assistant could not respond"); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 p-4 md:p-8">
    <div><h1 className="text-2xl font-semibold">AI assistant</h1>
      <p className="text-sm text-slate-600">Ask about your CRM, draft outreach, or make changes. Powered by Nemotron.</p></div>
    <details className="rounded-xl border bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold">Calling from: {profile.company_name || "Set your company context"}</summary>
      <p className="mt-2 text-xs text-slate-600">Prefilled from VictorySync’s public website. Edit campaign-specific details before drafting outreach. Changes are saved in this browser.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{([
        ["company_name", "Company name", "The business we call from"],
        ["what_we_do", "What we do", "Describe your service in a sentence"],
        ["ideal_customers", "Who we help", "e.g. Plumbing and HVAC businesses"],
        ["offers", "Offers and pricing", "Only confirmed offers, trials, or prices"],
        ["differentiators", "Why choose us", "Proof, process, and differentiators"],
        ["call_goal", "Goal of the call", "e.g. Book a short discovery call"],
        ["tone", "Preferred tone", "e.g. Direct, friendly, concise"],
        ["signature", "Email signature", "Your preferred sign-off"],
      ] as const).map(([key, label, placeholder]) => <label key={key} className="text-xs font-medium text-slate-700">{label}
        <textarea value={profile[key]} onChange={(e) => { setProfile({ ...profile, [key]: e.target.value.slice(0, 1000) }); setProfileSaved(false); }}
          placeholder={placeholder} rows={key === "what_we_do" || key === "offers" ? 3 : 2}
          className="mt-1 w-full rounded-lg border p-2 text-sm font-normal" /></label>)}</div>
      <button type="button" onClick={() => { saveAssistantProfile(profile); setProfileSaved(true); }}
        className="mt-3 rounded-lg border px-4 py-2 text-sm font-semibold">Save context</button>
      {profileSaved && <span role="status" className="ml-3 text-xs text-green-700">Saved for this browser</span>}
    </details>
    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-white p-4" aria-live="polite">
      {!messages.length && <div className="grid gap-2 sm:grid-cols-2">{suggestions.map((s) =>
        <button key={s} onClick={() => void submit(s)} className="rounded-lg border p-3 text-left text-sm hover:bg-slate-50">{s}</button>)}</div>}
      <div className="space-y-4">{messages.map((m, i) => <div key={i} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-xl bg-blue-50 p-3 text-sm" : "max-w-[90%] whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm"}>
        <div className="mb-1 text-xs font-semibold text-slate-500">{m.role === "user" ? "You" : "Assistant"}</div>{m.content}</div>)}</div>
      {busy && <p className="mt-4 text-sm text-slate-500">Working…</p>}
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex gap-2">
      <textarea aria-label="Message" value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
        placeholder="Ask anything about your CRM or outreach…" className="min-w-0 flex-1 rounded-lg border p-3 text-sm" />
      <button disabled={busy || !draft.trim()} className="rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white disabled:opacity-50">Send</button>
    </form>
  </div>;
}
