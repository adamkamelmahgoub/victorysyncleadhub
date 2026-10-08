import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { loadAssistantProfile, saveAssistantProfile, type AssistantProfile } from "@/lib/assistant-profile";

type Event = { name: string; status: "ok" | "error"; detail: string };
type Message = { id: string; role: "user" | "assistant"; content: string; tool_events: Event[] };
type Conversation = { id: string; title: string; updated_at: string };
type Memory = { id: string; content: string };
const suggestions = ["Find 10 roofing businesses in Tulsa, OK that fit VictorySync and show why", "Draft a cold email for a lead in my CRM using only verified details", "Show my overdue CRM tasks and suggest what to do first", "Summarize my pipeline and flag deals needing attention"];

export default function AiAssistant({ compact = false, pageContext }: { compact?: boolean; pageContext?: { type: "lead" | "company"; id: string } }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [showMemories, setShowMemories] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<AssistantProfile>(() => loadAssistantProfile());
  const [profileSaved, setProfileSaved] = useState(false);
  async function refreshConversations() {
    const data = await apiFetch("/api/assistant?action=conversations") as { conversations: Conversation[] };
    setConversations(data.conversations);
  }
  async function refreshMemories() {
    const data = await apiFetch("/api/assistant?action=memories") as { memories: Memory[] };
    setMemories(data.memories);
  }
  async function openConversation(id: string) {
    try {
      const data = await apiFetch(`/api/assistant?action=messages&id=${id}`) as { messages: Message[] };
      setConversationId(id); setMessages(data.messages); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not open conversation"); }
  }
  useEffect(() => {
    let active = true;
    Promise.all([apiFetch("/api/assistant?action=conversations"), apiFetch("/api/assistant?action=memories")])
      .then(([chats, saved]) => {
        if (!active) return;
        const list = (chats as { conversations: Conversation[] }).conversations;
        setConversations(list); setMemories((saved as { memories: Memory[] }).memories);
        if (list[0]) void openConversation(list[0].id);
      }).catch((err) => { if (active) setError(err instanceof Error ? err.message : "Could not load assistant history"); });
    return () => { active = false; };
  }, []);
  async function submit(value = draft) {
    const prompt = value.trim();
    if (!prompt || busy) return;
    setDraft(""); setBusy(true); setError("");
    const temporary: Message = { id: `pending-${Date.now()}`, role: "user", content: prompt, tool_events: [] };
    setMessages((current) => [...current, temporary]);
    try {
      const result = await apiFetch("/api/assistant", { method: "POST", body: JSON.stringify({ message: prompt, conversation_id: conversationId, seller_context: profile, page_context: pageContext }) }) as { conversation: Conversation; user_message: Message; assistant_message: Message };
      setConversationId(result.conversation.id);
      setMessages((current) => [...current.filter((m) => m.id !== temporary.id), result.user_message, result.assistant_message]);
      await refreshConversations();
    } catch (err) {
      setMessages((current) => current.filter((m) => m.id !== temporary.id));
      setDraft(prompt); setError(err instanceof Error ? err.message : "The assistant could not respond");
      if (conversationId) void openConversation(conversationId);
      await refreshConversations().catch(() => {});
    } finally { setBusy(false); }
  }
  async function saveMemory(content: string) {
    if (!content.trim()) return;
    try {
      await apiFetch("/api/assistant?action=memory", { method: "POST", body: JSON.stringify({ content: content.trim() }) });
      setMemoryDraft(""); await refreshMemories();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save memory"); }
  }
  async function removeMemory(id: string) {
    try { await apiFetch(`/api/assistant?action=memory&id=${id}`, { method: "DELETE" }); await refreshMemories(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not remove memory"); }
  }
  async function removeConversation(id: string) {
    try {
      await apiFetch(`/api/assistant?action=conversation&id=${id}`, { method: "DELETE" });
      if (conversationId === id) { setConversationId(null); setMessages([]); }
      await refreshConversations();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not delete conversation"); }
  }
  return <div className={`mx-auto flex h-full min-h-0 flex-col gap-3 ${compact ? "p-3" : "max-w-6xl p-4 md:p-8"}`}>
    <div><h1 className={compact ? "text-lg font-semibold" : "text-2xl font-semibold"}>AI assistant</h1><p className="text-sm text-slate-600">CRM conversations, tools, and saved context. Powered by Nemotron.</p></div>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={() => { setConversationId(null); setMessages([]); setError(""); }} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">New chat</button>
      <select aria-label="Chat history" disabled={busy} value={conversationId || ""} onChange={(e) => { if (e.target.value) void openConversation(e.target.value); }} className="min-w-0 max-w-64 rounded-lg border bg-white p-2 text-sm"><option value="">Chat history</option>{conversations.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
      {conversationId && <button type="button" disabled={busy} onClick={() => void removeConversation(conversationId)} className="rounded-lg border px-3 py-2 text-sm text-red-700">Delete chat</button>}
      <button type="button" onClick={() => setShowMemories(!showMemories)} className="rounded-lg border px-3 py-2 text-sm">Memory ({memories.length})</button>
    </div>
    {showMemories && <section className="rounded-xl border bg-white p-3" aria-label="Assistant memory"><h2 className="text-sm font-semibold">Saved memory</h2><p className="text-xs text-slate-600">Facts saved here are available in future chats.</p>
      <div className="mt-2 max-h-32 space-y-1 overflow-auto">{memories.map((m) => <div key={m.id} className="flex items-start justify-between gap-2 text-sm"><span>{m.content}</span><button type="button" onClick={() => void removeMemory(m.id)} className="text-red-700">Remove</button></div>)}</div>
      <form onSubmit={(e) => { e.preventDefault(); void saveMemory(memoryDraft); }} className="mt-2 flex gap-2"><input aria-label="New memory" value={memoryDraft} maxLength={1000} onChange={(e) => setMemoryDraft(e.target.value)} placeholder="Remember a preference or company fact" className="min-w-0 flex-1 rounded-lg border p-2 text-sm"/><button disabled={!memoryDraft.trim()} className="rounded-lg border px-3 text-sm">Save</button></form></section>}
    {!compact && <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Calling from: {profile.company_name || "Set your company context"}</summary><p className="mt-2 text-xs text-slate-600">Edit campaign details before drafting outreach. Changes are saved in this browser.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{(["company_name", "what_we_do", "ideal_customers", "offers", "differentiators", "call_goal", "tone", "signature"] as const).map((key) => <label key={key} className="text-xs font-medium text-slate-700">{key.replaceAll("_", " ")}<textarea value={profile[key]} onChange={(e) => { setProfile({ ...profile, [key]: e.target.value.slice(0, 1000) }); setProfileSaved(false); }} rows={2} className="mt-1 w-full rounded-lg border p-2 text-sm font-normal" /></label>)}</div>
      <button type="button" onClick={() => { saveAssistantProfile(profile); setProfileSaved(true); }} className="mt-3 rounded-lg border px-4 py-2 text-sm font-semibold">Save context</button>{profileSaved && <span role="status" className="ml-3 text-xs text-green-700">Saved for this browser</span>}</details>}
    {compact && pageContext && <p className="text-xs text-blue-700">Current {pageContext.type} record is available for this conversation.</p>}
    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-white p-4" aria-live="polite">
      {!messages.length && <div className="grid gap-2 sm:grid-cols-2">{suggestions.map((s) => <button key={s} onClick={() => void submit(s)} className="rounded-lg border p-3 text-left text-sm hover:bg-slate-50">{s}</button>)}</div>}
      <div className="space-y-4">{messages.map((m) => <div key={m.id} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-xl bg-blue-50 p-3 text-sm" : "max-w-[90%] rounded-xl bg-slate-50 p-3 text-sm"}><div className="mb-1 text-xs font-semibold text-slate-500">{m.role === "user" ? "You" : "Assistant"}</div><div className="whitespace-pre-wrap">{m.content}</div>
        {m.role === "assistant" && !!m.tool_events?.length && <details className="mt-2 border-t pt-2 text-xs"><summary className="cursor-pointer text-slate-600">Tools used ({m.tool_events.length})</summary><ul className="mt-1 space-y-1">{m.tool_events.map((event, index) => <li key={index} className={event.status === "error" ? "text-red-700" : "text-slate-600"}>{event.name}: {event.detail}</li>)}</ul></details>}
        {m.role === "user" && !m.id.startsWith("pending-") && <button type="button" onClick={() => void saveMemory(m.content)} className="mt-2 text-xs text-blue-700">Remember this</button>}</div>)}</div>
      {busy && <p className="mt-4 text-sm text-slate-500">Working...</p>}
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex gap-2"><textarea aria-label="Message" value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Ask anything about your CRM or outreach..." className="min-w-0 flex-1 rounded-lg border p-3 text-sm" /><button disabled={busy || !draft.trim()} className="rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white disabled:opacity-50">Send</button></form>
  </div>;
}
