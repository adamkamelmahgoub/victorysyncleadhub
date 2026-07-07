import { useState } from "react";
import { Layout } from "@/components/layout";
import { useListLeads } from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";
import {
  Search, Send, Mail, Phone, MoreHorizontal, RefreshCw,
  Star, Archive, Trash2, Filter, ChevronDown, MessageSquare,
  User, Clock,
} from "lucide-react";

type FilterTab = "all" | "email" | "sms" | "unread";

const SAMPLE_THREADS: Record<string, { from: string; body: string; time: string; type: "sent" | "received" }[]> = {};

export default function Conversations() {
  const { data: leadsData } = useListLeads({ params: { query: { limit: 50 } } });
  const leads = leadsData?.leads ?? [];

  const [filter, setFilter] = useState<FilterTab>("all");
  const [selectedId, setSelectedId] = useState<number | null>(leads[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [sentMessages, setSentMessages] = useState<Record<number, { body: string; time: string }[]>>({});

  const filtered = leads.filter((l) => {
    if (search) {
      const q = search.toLowerCase();
      return (
        l.firstName?.toLowerCase().includes(q) ||
        l.lastName?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.company?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selected = leads.find((l) => l.id === selectedId);

  function sendReply() {
    if (!reply.trim() || !selectedId) return;
    setSentMessages((prev) => ({
      ...prev,
      [selectedId]: [...(prev[selectedId] ?? []), { body: reply.trim(), time: new Date().toISOString() }],
    }));
    setReply("");
  }

  const TABS: { id: FilterTab; label: string; count?: number }[] = [
    { id: "all", label: "All", count: leads.length },
    { id: "email", label: "Email" },
    { id: "sms", label: "SMS" },
    { id: "unread", label: "Unread", count: 3 },
  ];

  const STATUS_COLOR: Record<string, string> = {
    new: "bg-blue-100 text-blue-700",
    contacted: "bg-purple-100 text-purple-700",
    qualified: "bg-green-100 text-green-700",
    converted: "bg-emerald-100 text-emerald-700",
    lost: "bg-red-100 text-red-700",
  };

  return (
    <Layout>
      <div className="flex h-full -m-6 overflow-hidden rounded-none" style={{ height: "calc(100vh - 3.5rem)" }}>

        {/* ── Left panel: conversation list ── */}
        <div className="w-80 flex-shrink-0 border-r border-border bg-white flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-foreground text-base">Conversations</h2>
              <div className="flex gap-1">
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground"><RefreshCw className="w-3.5 h-3.5" /></button>
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Filter className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations..."
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted rounded-lg border-0 outline-none text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex border-b border-border flex-shrink-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                className={`flex-1 text-xs py-2 font-medium border-b-2 transition-colors ${
                  filter === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {t.count !== undefined && (
                  <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${filter === t.id ? "bg-primary/15" : "bg-muted"}`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No conversations found</div>
            ) : (
              filtered.map((lead, i) => {
                const isSelected = selectedId === lead.id;
                const hasSent = (sentMessages[lead.id]?.length ?? 0) > 0;
                const lastMsg = sentMessages[lead.id]?.at(-1);
                return (
                  <button
                    key={lead.id}
                    onClick={() => setSelectedId(lead.id)}
                    className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/50 transition-colors ${isSelected ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isSelected ? "bg-primary text-white" : "bg-muted text-foreground"}`}>
                        {lead.firstName?.[0]}{lead.lastName?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-foreground truncate">
                            {lead.firstName} {lead.lastName}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-1">
                            {hasSent ? formatDistanceToNow(new Date(lastMsg!.time), { addSuffix: false }) : i < 4 ? `${i + 1}h` : `${i}d`}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{lead.company ?? lead.email}</div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {hasSent ? lastMsg?.body : i % 3 === 0 ? "Thanks for reaching out!" : i % 3 === 1 ? "Can we schedule a call?" : "No reply yet"}
                        </div>
                      </div>
                    </div>
                    {i < 3 && !hasSent && (
                      <div className="mt-1 ml-12">
                        <span className="inline-block w-2 h-2 rounded-full bg-primary" />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right panel: conversation thread ── */}
        {selected ? (
          <div className="flex-1 flex flex-col bg-background min-w-0">
            {/* Contact header */}
            <div className="bg-white border-b border-border px-6 py-3 flex items-center gap-4 flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                {selected.firstName?.[0]}{selected.lastName?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground text-sm">
                  {selected.firstName} {selected.lastName}
                </div>
                <div className="text-xs text-muted-foreground">{selected.email} · {selected.company}</div>
              </div>
              <div className="flex items-center gap-2">
                {selected.status && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLOR[selected.status] ?? "bg-gray-100 text-gray-700"}`}>
                    {selected.status}
                  </span>
                )}
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Phone className="w-4 h-4" /></button>
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Mail className="w-4 h-4" /></button>
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Star className="w-4 h-4" /></button>
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Archive className="w-4 h-4" /></button>
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground"><MoreHorizontal className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Thread area */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* System note */}
              <div className="flex justify-center">
                <span className="text-[11px] text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  Contact created · {formatDistanceToNow(new Date(selected.createdAt ?? Date.now()), { addSuffix: true })}
                </span>
              </div>

              {/* Sample incoming messages for first few contacts */}
              {leads.indexOf(selected) < 3 && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {selected.firstName?.[0]}
                  </div>
                  <div className="max-w-md">
                    <div className="bg-white border border-border rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm">
                      <p className="text-sm text-foreground">
                        {leads.indexOf(selected) === 0
                          ? "Hi, I saw your message. I'd love to learn more about your platform. Can we set up a quick 15-minute call this week?"
                          : leads.indexOf(selected) === 1
                          ? "Thanks for reaching out! We're definitely interested in exploring this further. What does your pricing look like?"
                          : "Just following up on your last email. We had a chance to review the proposal and have a few questions."}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 mt-1 ml-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">
                        {leads.indexOf(selected) === 0 ? "2 hours ago" : leads.indexOf(selected) === 1 ? "Yesterday, 3:41 PM" : "Jun 28, 9:15 AM"}
                      </span>
                      <Mail className="w-3 h-3 text-muted-foreground ml-1" />
                      <span className="text-[10px] text-muted-foreground">Email</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Sent messages */}
              {(sentMessages[selected.id] ?? []).map((msg, i) => (
                <div key={i} className="flex gap-3 justify-end">
                  <div className="max-w-md">
                    <div className="bg-primary text-white rounded-2xl rounded-tr-sm px-4 py-2.5">
                      <p className="text-sm">{msg.body}</p>
                    </div>
                    <div className="flex items-center justify-end gap-1 mt-1 mr-1">
                      <span className="text-[10px] text-muted-foreground">Just now · Sent</span>
                    </div>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    VS
                  </div>
                </div>
              ))}

              {leads.indexOf(selected) >= 3 && (sentMessages[selected.id] ?? []).length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <MessageSquare className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-foreground">No messages yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Start the conversation below</p>
                </div>
              )}
            </div>

            {/* Reply box */}
            <div className="bg-white border-t border-border px-6 py-4 flex-shrink-0">
              <div className="flex gap-3 items-start">
                <div className="flex gap-2 mb-2">
                  <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-primary text-primary font-medium">
                    <Mail className="w-3.5 h-3.5" /> Email
                  </button>
                  <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground font-medium hover:border-primary hover:text-primary transition-colors">
                    <Phone className="w-3.5 h-3.5" /> SMS
                  </button>
                </div>
              </div>
              <div className="border border-border rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary/30">
                <div className="px-3 py-1.5 border-b border-border bg-muted/40 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>To:</span>
                  <span className="text-foreground font-medium">{selected.firstName} {selected.lastName} &lt;{selected.email}&gt;</span>
                </div>
                <div className="px-3 py-1.5 border-b border-border bg-muted/40 flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Subject:</span>
                  <input className="flex-1 outline-none bg-transparent text-foreground placeholder:text-muted-foreground" placeholder="Re: Follow up" />
                </div>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && e.metaKey && sendReply()}
                  placeholder="Write your message... (⌘+Enter to send)"
                  rows={4}
                  className="w-full px-3 py-2.5 text-sm outline-none resize-none bg-white text-foreground placeholder:text-muted-foreground"
                />
                <div className="px-3 py-2 flex items-center justify-between bg-muted/20">
                  <div className="flex gap-1 text-muted-foreground">
                    <button className="p-1.5 rounded hover:bg-muted hover:text-foreground">B</button>
                    <button className="p-1.5 rounded hover:bg-muted hover:text-foreground italic">I</button>
                    <button className="p-1.5 rounded hover:bg-muted hover:text-foreground underline">U</button>
                  </div>
                  <button
                    onClick={sendReply}
                    disabled={!reply.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" /> Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-background">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
              <p className="text-foreground font-medium">Select a conversation</p>
              <p className="text-sm text-muted-foreground mt-1">Choose a contact from the left panel</p>
            </div>
          </div>
        )}

        {/* ── Right info panel ── */}
        {selected && (
          <div className="w-64 flex-shrink-0 border-l border-border bg-white overflow-y-auto">
            <div className="p-4 border-b border-border">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-base font-bold text-primary mx-auto mb-2">
                  {selected.firstName?.[0]}{selected.lastName?.[0]}
                </div>
                <div className="font-semibold text-foreground text-sm">{selected.firstName} {selected.lastName}</div>
                <div className="text-xs text-muted-foreground">{selected.title ?? "Contact"}</div>
                {selected.company && <div className="text-xs text-muted-foreground">{selected.company}</div>}
              </div>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Contact Info</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs"><Mail className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-foreground truncate">{selected.email}</span></div>
                  {selected.phone && <div className="flex items-center gap-2 text-xs"><Phone className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-foreground">{selected.phone}</span></div>}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Lead Details</div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="capitalize font-medium text-foreground">{selected.status ?? "New"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Score</span><span className="font-medium text-foreground">{selected.score ?? 0}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Source</span><span className="capitalize font-medium text-foreground">{selected.source ?? "—"}</span></div>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quick Actions</div>
                <div className="space-y-1.5">
                  <button className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-muted-foreground" /> View full contact
                  </button>
                  <button className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors flex items-center gap-2">
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" /> Delete conversation
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
