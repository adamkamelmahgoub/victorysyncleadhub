import { useState } from "react";
import { apiFetch } from "@/lib/api";

type Message = { role: "user" | "assistant"; content: string };
const suggestions = [
  "Write a cold email for a plumbing company with weak Google visibility",
  "Give me three opening lines for a follow-up call",
  "Show my overdue CRM tasks and suggest what to do first",
  "Summarize my pipeline and flag deals needing attention",
];
export default function AiAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(value = draft) {
    const prompt = value.trim();
    if (!prompt || busy) return;
    const next: Message[] = [...messages.slice(-10), { role: "user", content: prompt }];
    setMessages(next);
    setDraft(""); setBusy(true); setError("");
    try {
      const result = await apiFetch("/api/assistant", { method: "POST", body: JSON.stringify({ messages: next }) }) as { answer: string };
      setMessages([...next, { role: "assistant", content: result.answer }]);
    } catch (err) { setError(err instanceof Error ? err.message : "The assistant could not respond"); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 p-4 md:p-8">
    <div><h1 className="text-2xl font-semibold">AI assistant</h1>
      <p className="text-sm text-slate-600">Ask about your CRM, draft outreach, or make changes. Powered by Nemotron.</p></div>
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
