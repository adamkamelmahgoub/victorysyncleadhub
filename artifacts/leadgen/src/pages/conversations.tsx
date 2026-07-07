import { useState } from "react";
import { useListLeads } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Search, Send, Mail, Phone, MoreHorizontal, RefreshCw,
  Star, Archive, Trash2, Filter, MessageSquare, Clock,
  User, Facebook, Instagram, ExternalLink, Plug,
} from "lucide-react";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { asArray, type ArrayElement } from "@/lib/data-shape";

type Channel = "all" | "email" | "sms" | "facebook" | "instagram" | "whatsapp";
type EmailLog = { id: number; leadId: number; subject?: string; body?: string; sentAt?: string; status?: string };

const CHANNEL_CONFIG: Record<Channel, { label: string; color: string; icon: React.ElementType; connected: boolean }> = {
  all: { label: "All", color: "text-foreground", icon: MessageSquare, connected: true },
  email: { label: "Email", color: "text-blue-600", icon: Mail, connected: true },
  sms: { label: "SMS", color: "text-green-600", icon: Phone, connected: false },
  facebook: { label: "Facebook", color: "text-blue-500", icon: Facebook, connected: false },
  instagram: { label: "Instagram", color: "text-pink-500", icon: Instagram, connected: false },
  whatsapp: { label: "WhatsApp", color: "text-green-500", icon: MessageSquare, connected: false },
};

const STATUS_COLOR: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  contacted: "bg-purple-100 text-purple-700",
  qualified: "bg-green-100 text-green-700",
  converted: "bg-emerald-100 text-emerald-700",
  lost: "bg-red-100 text-red-700",
  proposal: "bg-amber-100 text-amber-700",
};

export default function Conversations() {
  const { data: leadsData } = useListLeads();
  const leads = asArray<ArrayElement<NonNullable<typeof leadsData>["leads"]>>(leadsData?.leads);

  const [channel, setChannel] = useState<Channel>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [replySubject, setReplySubject] = useState("Follow up");
  const [sentMessages, setSentMessages] = useState<Record<number, { body: string; time: string }[]>>({});

  const selected = leads.find((l) => l.id === selectedId);

  const { data: activities } = useQuery({
    queryKey: ["activities", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      return asArray(await apiFetch(`/api/leads/${selectedId}/activities`));
    },
    enabled: !!selectedId,
  });

  const { data: emailLogs } = useQuery({
    queryKey: ["email-logs", selectedId],
    queryFn: async () => {
      const all = asArray<EmailLog>(await apiFetch("/api/email/logs"));
      return all.filter((l) => l.leadId === selectedId);
    },
    enabled: !!selectedId,
  });

  const channelConfig = CHANNEL_CONFIG[channel];

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

  function sendReply() {
    if (!reply.trim() || !selectedId) return;
    setSentMessages((prev) => ({
      ...prev,
      [selectedId]: [...(prev[selectedId] ?? []), { body: reply.trim(), time: new Date().toISOString() }],
    }));
    setReply("");
  }

  const CHANNELS: Channel[] = ["all", "email", "sms", "facebook", "instagram", "whatsapp"];

  return (

      <div className="flex -m-6 overflow-hidden" style={{ height: "calc(100vh - 3.5rem)" }}>

        {/* ── Left: conversation list ── */}
        <div className="w-72 flex-shrink-0 border-r border-border bg-white flex flex-col">
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-foreground text-sm">Conversations</h2>
              <div className="flex gap-1">
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground"><RefreshCw className="w-3.5 h-3.5" /></button>
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Filter className="w-3.5 h-3.5" /></button>
              </div>
            </div>
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

          {/* Channel tabs */}
          <div className="flex overflow-x-auto border-b border-border flex-shrink-0 px-2 gap-0.5 py-1">
            {CHANNELS.map((ch) => {
              const cfg = CHANNEL_CONFIG[ch];
              const Icon = cfg.icon;
              return (
                <button
                  key={ch}
                  onClick={() => setChannel(ch)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors relative ${
                    channel === ch ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {cfg.label}
                  {!cfg.connected && ch !== "all" && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Not connected warning */}
          {channelConfig && !channelConfig.connected && channel !== "all" && (
            <div className="mx-3 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs flex-shrink-0">
              <div className="font-semibold text-amber-700 mb-1">{channelConfig.label} not connected</div>
              <p className="text-amber-600 mb-2">Connect your {channelConfig.label} account to see conversations here.</p>
          <Link href="/integrations">
                <span className="flex items-center gap-1 text-primary font-medium hover:underline">
                  <Plug className="w-3 h-3" /> Connect now
                </span>
              </Link>
            </div>
          )}

          {/* Contact list */}
          <div className="flex-1 overflow-y-auto">
            {filtered.map((lead, i) => {
              const isSelected = selectedId === lead.id;
              const hasSent = (sentMessages[lead.id]?.length ?? 0) > 0;
              const lastMsg = sentMessages[lead.id]?.at(-1);
              const hasUnread = i < 3;
              return (
                <button
                  key={lead.id}
                  onClick={() => setSelectedId(lead.id)}
                  className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/40 transition-colors ${isSelected ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isSelected ? "bg-primary text-white" : "bg-muted text-foreground"}`}>
                      {lead.firstName?.[0]}{lead.lastName?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold truncate ${hasUnread ? "text-foreground" : "text-foreground/80"}`}>
                          {lead.firstName} {lead.lastName}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-1">
                          {hasSent ? "now" : `${i + 1}h`}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{lead.company ?? lead.email}</div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {hasSent ? lastMsg?.body : i % 3 === 0 ? "Thanks for reaching out!" : i % 3 === 1 ? "Can we schedule a call?" : "No reply yet"}
                      </div>
                    </div>
                  </div>
                  {hasUnread && !hasSent && (
                    <div className="flex justify-end mt-1">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Center: thread ── */}
        {selected ? (
          <div className="flex-1 flex flex-col min-w-0">
            {/* Contact header */}
            <div className="bg-white border-b border-border px-5 py-3 flex items-center gap-3 flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                {selected.firstName?.[0]}{selected.lastName?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground text-sm">{selected.firstName} {selected.lastName}</div>
                <div className="text-xs text-muted-foreground">{selected.email}{selected.company ? ` · ${selected.company}` : ""}</div>
              </div>
              <div className="flex items-center gap-1.5">
                {selected.status && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLOR[selected.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {selected.status}
                  </span>
                )}
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Phone className="w-4 h-4" /></button>
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Star className="w-4 h-4" /></button>
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Archive className="w-4 h-4" /></button>
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground"><MoreHorizontal className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Thread */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-background">
              <div className="flex justify-center">
                <span className="text-[11px] text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  Contact created {formatDistanceToNow(new Date(selected.createdAt ?? Date.now()), { addSuffix: true })}
                </span>
              </div>

              {/* Real email logs */}
              {Array.isArray(emailLogs) && emailLogs.map((log: EmailLog) => (
                <div key={log.id} className="flex gap-3 justify-end">
                  <div className="max-w-lg">
                    <div className="bg-primary text-white rounded-2xl rounded-tr-sm px-4 py-2.5">
                      {log.subject && <div className="text-xs font-semibold mb-1 opacity-80">{log.subject}</div>}
                      <p className="text-sm">{log.body ?? "(email sent)"}</p>
                    </div>
                    <div className="flex items-center justify-end gap-1 mt-1 mr-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">
                        {log.sentAt ? formatDistanceToNow(new Date(log.sentAt), { addSuffix: true }) : ""} · {log.status}
                      </span>
                    </div>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-white flex-shrink-0">VS</div>
                </div>
              ))}

              {/* Real activities */}
              {Array.isArray(activities) && activities.map((act: { id: number; type: string; description: string; createdAt: string }) => (
                <div key={act.id} className="flex justify-center">
                  <span className="text-[11px] text-muted-foreground bg-muted px-3 py-1 rounded-full">
                    {act.description} · {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true })}
                  </span>
                </div>
              ))}

              {/* Sample received message for first contacts */}
              {leads.indexOf(selected) < 3 && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {selected.firstName?.[0]}
                  </div>
                  <div className="max-w-lg">
                    <div className="bg-white border border-border rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm">
                      <p className="text-sm text-foreground">
                        {leads.indexOf(selected) === 0
                          ? "Hi, I saw your message. I'd love to learn more about your platform. Can we set up a quick 15-minute call this week?"
                          : leads.indexOf(selected) === 1
                          ? "Thanks for reaching out! We're definitely interested. What does pricing look like?"
                          : "Just following up on your last email. We had a chance to review the proposal and have a few questions."}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 mt-1 ml-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">
                        {leads.indexOf(selected) === 0 ? "2 hours ago" : leads.indexOf(selected) === 1 ? "Yesterday" : "2 days ago"}
                      </span>
                      <Mail className="w-3 h-3 text-muted-foreground ml-1" />
                    </div>
                  </div>
                </div>
              )}

              {/* New sent messages */}
              {(sentMessages[selected.id] ?? []).map((msg, i) => (
                <div key={i} className="flex gap-3 justify-end">
                  <div className="max-w-lg">
                    <div className="bg-primary text-white rounded-2xl rounded-tr-sm px-4 py-2.5">
                      <p className="text-sm">{msg.body}</p>
                    </div>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[10px] text-muted-foreground">Just now · Sent</span>
                    </div>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-white flex-shrink-0">VS</div>
                </div>
              ))}
            </div>

            {/* Reply box */}
            <div className="bg-white border-t border-border px-5 py-3 flex-shrink-0">
              <div className="flex gap-2 mb-2">
                {(["email", "sms"] as const).map((ch) => {
                  const cfg = CHANNEL_CONFIG[ch];
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={ch}
                      disabled={!cfg.connected}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors capitalize ${
                        ch === "email" ? "border-primary text-primary" : "border-border text-muted-foreground opacity-60"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" /> {cfg.label}
                    </button>
                  );
                })}
              </div>
              <div className="border border-border rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary/30">
                <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">To:</span>
                  <span className="text-foreground font-medium">{selected.firstName} {selected.lastName} &lt;{selected.email}&gt;</span>
                </div>
                <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Subject:</span>
                  <input
                    className="flex-1 outline-none bg-transparent text-foreground placeholder:text-muted-foreground"
                    value={replySubject}
                    onChange={(e) => setReplySubject(e.target.value)}
                    placeholder="Re: Follow up"
                  />
                </div>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && e.metaKey && sendReply()}
                  placeholder="Write your message... (⌘+Enter to send)"
                  rows={3}
                  className="w-full px-3 py-2 text-sm outline-none resize-none bg-white text-foreground placeholder:text-muted-foreground"
                />
                <div className="px-3 py-2 flex items-center justify-between bg-muted/20">
                  <div className="flex gap-1 text-xs text-muted-foreground">
                    <button className="px-1.5 py-0.5 rounded hover:bg-muted font-bold">B</button>
                    <button className="px-1.5 py-0.5 rounded hover:bg-muted italic">I</button>
                    <button className="px-1.5 py-0.5 rounded hover:bg-muted underline">U</button>
                  </div>
                  <button
                    onClick={sendReply}
                    disabled={!reply.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors"
                  >
                    <Send className="w-3 h-3" /> Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-background">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
              <p className="font-medium text-foreground">Select a conversation</p>
              <p className="text-sm text-muted-foreground mt-1">Choose a contact from the left panel</p>
            </div>
          </div>
        )}

        {/* ── Right: contact info ── */}
        {selected && (
          <div className="w-60 flex-shrink-0 border-l border-border bg-white overflow-y-auto">
            <div className="p-4 border-b border-border text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-base font-bold text-primary mx-auto mb-2">
                {selected.firstName?.[0]}{selected.lastName?.[0]}
              </div>
              <div className="font-semibold text-foreground text-sm">{selected.firstName} {selected.lastName}</div>
              <div className="text-xs text-muted-foreground">{selected.title ?? "Contact"}</div>
              {selected.company && <div className="text-xs text-muted-foreground">{selected.company}</div>}
            </div>
            <div className="p-4 space-y-4">
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Contact Info</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs"><Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /><span className="text-foreground truncate">{selected.email}</span></div>
                  {selected.phone && <div className="flex items-center gap-2 text-xs"><Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /><span className="text-foreground">{selected.phone}</span></div>}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Lead Details</div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="capitalize font-medium">{selected.status ?? "New"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Score</span><span className="font-medium">{selected.score ?? 0}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Source</span><span className="capitalize font-medium">{selected.source ?? "—"}</span></div>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quick Actions</div>
                <div className="space-y-1">
                    <Link href={`/leads/${selected.id}`}>
                    <div className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors flex items-center gap-2 cursor-pointer">
                      <User className="w-3.5 h-3.5 text-muted-foreground" /> View Profile
                    </div>
                  </Link>
                  <button className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors flex items-center gap-2">
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" /> Open in CRM
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

  );
}
