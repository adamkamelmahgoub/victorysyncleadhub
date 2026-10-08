import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { MessageCircle, X } from "lucide-react";
import AiAssistant from "@/pages/ai-assistant";
import { useAuth } from "@/lib/auth";

export function AssistantLauncher() {
  const { role } = useAuth();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (role !== "owner" && role !== "admin") return null;
  const match = location.replace(/^\/leadgen/, "").match(/^\/(leads|companies)\/([0-9a-f-]{36})(?:\/|$)/i);
  const pageContext = match ? { type: match[1] === "leads" ? "lead" as const : "company" as const,
    id: match[2] } : undefined;
  return <div className="fixed bottom-4 right-4 z-[70] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
    <section role="dialog" aria-label="VictorySync AI assistant" aria-modal="false" aria-hidden={!open}
      className={`${open ? "flex" : "hidden"} h-[min(72vh,650px)] w-[min(calc(100vw-2rem),430px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl`}>
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2 text-xs">
        <Link href="/ai-assistant" onClick={() => setOpen(false)} className="font-medium text-blue-700 underline">Open full assistant and edit context</Link>
        <button type="button" aria-label="Close AI assistant" onClick={() => setOpen(false)} className="rounded p-2 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 flex-1"><AiAssistant compact pageContext={pageContext} /></div>
    </section>
    <button type="button" aria-label={open ? "Close AI assistant" : "Open AI assistant"}
      aria-expanded={open} onClick={() => setOpen(!open)}
      className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-700 text-white shadow-xl ring-4 ring-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
      {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
    </button>
  </div>;
}
