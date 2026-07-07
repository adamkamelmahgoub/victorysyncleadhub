import { useState } from "react";
import { Layout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Star, TrendingUp, Send, MessageSquare, Search, Plus,
  CheckCircle, AlertCircle, Globe, Settings, Trash2,
  ExternalLink, Mail, Phone, ChevronDown, BarChart3,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

interface ReviewSource {
  id: number;
  platform: string;
  name: string;
  businessId?: string;
  reviewUrl?: string;
  status: string;
  reviewCount: number;
  avgRating: string;
  isActive: boolean;
  createdAt: string;
}

interface Review {
  id: number;
  platform: string;
  reviewer: string;
  rating: number;
  text?: string;
  reply?: string;
  repliedAt?: string;
  reviewUrl?: string;
  sentiment?: string;
  isRead: boolean;
  createdAt: string;
}

interface ReviewStats {
  total: number;
  avgRating: string;
  byRating: { rating: number; count: number }[];
  byPlatform: { platform: string; count: number; avg: string }[];
  unreplied: number;
}

interface ReviewRequest {
  id: number;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  channel: string;
  platform: string;
  status: string;
  sentAt: string;
  clickedAt?: string;
}

const PLATFORM_CONFIG: Record<string, {
  color: string; bg: string; border: string; logo: string; logoColor: string;
  description: string; urlPattern: string;
}> = {
  google: { color: "text-red-600", bg: "bg-red-50", border: "border-red-200", logo: "G", logoColor: "bg-red-500", description: "Google Business Profile reviews", urlPattern: "https://g.page/r/[place-id]/review" },
  facebook: { color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", logo: "f", logoColor: "bg-blue-600", description: "Facebook page recommendations", urlPattern: "https://www.facebook.com/[page-name]/reviews" },
  yelp: { color: "text-red-500", bg: "bg-red-50", border: "border-red-200", logo: "Y", logoColor: "bg-red-600", description: "Yelp business reviews", urlPattern: "https://www.yelp.com/biz/[business-name]" },
  g2: { color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200", logo: "G2", logoColor: "bg-orange-500", description: "G2 software reviews", urlPattern: "https://www.g2.com/products/[product]/reviews" },
  trustpilot: { color: "text-green-600", bg: "bg-green-50", border: "border-green-200", logo: "T", logoColor: "bg-green-600", description: "Trustpilot business reviews", urlPattern: "https://www.trustpilot.com/review/[domain]" },
  capterra: { color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", logo: "C", logoColor: "bg-blue-700", description: "Capterra software reviews", urlPattern: "https://www.capterra.com/p/[product-id]/[product-name]" },
};

const AVAILABLE_PLATFORMS = Object.entries(PLATFORM_CONFIG).map(([key, cfg]) => ({ key, ...cfg }));

function StarRow({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const cls = size === "lg" ? "w-5 h-5" : "w-3.5 h-3.5";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${cls} ${i <= rating ? "text-amber-400 fill-amber-400" : "text-gray-200 fill-gray-200"}`} />
      ))}
    </div>
  );
}

const SENTIMENT_COLORS = { positive: "text-green-600 bg-green-50", neutral: "text-amber-600 bg-amber-50", negative: "text-red-600 bg-red-50" };

function ReviewCard({ review, onReply, onDelete }: { review: Review; onReply: (id: number, text: string) => void; onDelete: (id: number) => void }) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState(review.reply ?? "");
  const cfg = PLATFORM_CONFIG[review.platform.toLowerCase()] ?? PLATFORM_CONFIG.google!;
  const initials = review.reviewer.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">{initials}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground text-sm">{review.reviewer}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium border ${cfg.bg} ${cfg.color} ${cfg.border}`}>{review.platform}</span>
            {review.sentiment && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${SENTIMENT_COLORS[review.sentiment as keyof typeof SENTIMENT_COLORS] ?? SENTIMENT_COLORS.neutral}`}>{review.sentiment}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <StarRow rating={review.rating} />
            <span className="text-xs text-muted-foreground">{new Date(review.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {review.reviewUrl && (
            <a href={review.reviewUrl} target="_blank" className="p-1.5 rounded hover:bg-muted text-muted-foreground"><ExternalLink className="w-3.5 h-3.5" /></a>
          )}
          <button onClick={() => onDelete(review.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {review.text && <p className="text-sm text-foreground mb-3 leading-relaxed">{review.text}</p>}

      {review.reply ? (
        <div className="bg-muted/40 border border-border rounded-lg p-3">
          <div className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Your Reply</div>
          <p className="text-xs text-foreground">{review.reply}</p>
        </div>
      ) : (
        <div>
          {!showReply ? (
            <button onClick={() => setShowReply(true)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium">
              <MessageSquare className="w-3.5 h-3.5" /> Reply to this review
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a professional reply..."
                rows={3}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={() => { onReply(review.id, replyText); setShowReply(false); }} disabled={!replyText.trim()} className="px-3 py-1.5 text-xs bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-40">Post Reply</button>
                <button onClick={() => setShowReply(false)} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:bg-muted">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Tab = "overview" | "sources" | "reviews" | "request";
type PlatformFilter = "all" | "google" | "facebook" | "yelp" | "g2" | "trustpilot" | "capterra";
type RatingFilter = "all" | "5" | "4" | "3" | "2" | "1";

export default function Reputation() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [replyFilter, setReplyFilter] = useState<"all" | "unanswered">("all");
  const [search, setSearch] = useState("");
  const [showAddSource, setShowAddSource] = useState(false);
  const [addSourcePlatform, setAddSourcePlatform] = useState("google");
  const [addSourceFields, setAddSourceFields] = useState({ name: "", businessId: "", reviewUrl: "" });
  const [showAddReview, setShowAddReview] = useState(false);
  const [newReview, setNewReview] = useState({ platform: "google", reviewer: "", rating: 5, text: "" });
  const [requestForm, setRequestForm] = useState({ contactName: "", contactEmail: "", contactPhone: "", channel: "email" as "email" | "sms", platform: "google" });
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  const { data: sources = [] } = useQuery<ReviewSource[]>({ queryKey: ["review-sources"], queryFn: () => apiFetch("/api/review-sources") });
  const { data: stats } = useQuery<ReviewStats>({ queryKey: ["review-stats"], queryFn: () => apiFetch("/api/reviews/stats") });
  const { data: reviews = [] } = useQuery<Review[]>({ queryKey: ["reviews", platformFilter, ratingFilter, replyFilter], queryFn: () => apiFetch(`/api/reviews?platform=${platformFilter === "all" ? "" : platformFilter}&rating=${ratingFilter === "all" ? "" : ratingFilter}&replied=${replyFilter === "unanswered" ? "false" : ""}`) });
  const { data: requests = [] } = useQuery<ReviewRequest[]>({ queryKey: ["review-requests"], queryFn: () => apiFetch("/api/review-requests") });

  const addSource = useMutation({
    mutationFn: (body: object) => apiFetch("/api/review-sources", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["review-sources"] }); setShowAddSource(false); setAddSourceFields({ name: "", businessId: "", reviewUrl: "" }); showToast("Review source added!"); },
  });

  const deleteSource = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/review-sources/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["review-sources"] }); showToast("Source removed."); },
  });

  const addReview = useMutation({
    mutationFn: (body: object) => apiFetch("/api/reviews", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reviews"] }); qc.invalidateQueries({ queryKey: ["review-stats"] }); setShowAddReview(false); setNewReview({ platform: "google", reviewer: "", rating: 5, text: "" }); showToast("Review added!"); },
  });

  const replyToReview = useMutation({
    mutationFn: ({ id, reply }: { id: number; reply: string }) => apiFetch(`/api/reviews/${id}/reply`, { method: "PATCH", body: JSON.stringify({ reply }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reviews"] }); qc.invalidateQueries({ queryKey: ["review-stats"] }); showToast("Reply posted!"); },
  });

  const deleteReview = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/reviews/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reviews"] }); qc.invalidateQueries({ queryKey: ["review-stats"] }); },
  });

  const sendRequest = useMutation({
    mutationFn: (body: object) => apiFetch("/api/review-requests", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["review-requests"] }); setRequestForm({ contactName: "", contactEmail: "", contactPhone: "", channel: "email", platform: "google" }); showToast("Review request sent!"); },
  });

  const filtered = reviews.filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      if (!(`${r.reviewer} ${r.text ?? ""}`.toLowerCase().includes(q))) return false;
    }
    if (replyFilter === "unanswered" && r.reply) return false;
    return true;
  });

  const avgRating = parseFloat(stats?.avgRating ?? "0");
  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "sources", label: `Sources (${sources.length})` },
    { id: "reviews", label: `Reviews (${stats?.total ?? 0})` },
    { id: "request", label: "Request Reviews" },
  ];

  return (
    <Layout>
      <div className="space-y-5">
        {toast && (
          <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2 ${toast.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
            {toast.type === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}{toast.msg}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Reputation Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Monitor and manage your reviews across all platforms</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setTab("reviews"); setShowAddReview(true); }} className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:bg-muted">
              <Plus className="w-4 h-4" /> Add Review
            </button>
            <button onClick={() => setTab("request")} className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90">
              <Send className="w-4 h-4" /> Request Reviews
            </button>
          </div>
        </div>

        <div className="flex gap-1 border-b border-border">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === "overview" && (
          <div className="space-y-5">
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-border shadow-sm p-5 col-span-1">
                <div className="text-xs text-muted-foreground mb-2">Overall Rating</div>
                <div className="text-4xl font-bold text-foreground mb-1">{avgRating.toFixed(1)}</div>
                <StarRow rating={Math.round(avgRating)} size="lg" />
                <div className="text-xs text-muted-foreground mt-2">{stats?.total ?? 0} total reviews</div>
              </div>
              <div className="bg-white rounded-xl border border-border shadow-sm p-5">
                <div className="text-xs text-muted-foreground mb-1">Unreplied</div>
                <div className="text-3xl font-bold text-red-500">{stats?.unreplied ?? 0}</div>
                <button onClick={() => { setTab("reviews"); setReplyFilter("unanswered"); }} className="text-xs text-primary hover:underline mt-1">View unanswered</button>
              </div>
              <div className="bg-white rounded-xl border border-border shadow-sm p-5">
                <div className="text-xs text-muted-foreground mb-1">Platforms Connected</div>
                <div className="text-3xl font-bold text-blue-600">{sources.filter((s) => s.isActive).length}</div>
                <button onClick={() => setTab("sources")} className="text-xs text-primary hover:underline mt-1">Manage sources</button>
              </div>
              <div className="bg-white rounded-xl border border-border shadow-sm p-5">
                <div className="text-xs text-muted-foreground mb-1">Requests Sent</div>
                <div className="text-3xl font-bold text-green-600">{requests.length}</div>
                <div className="text-xs text-muted-foreground mt-1">{requests.filter((r) => r.clickedAt).length} clicked</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div className="bg-white rounded-xl border border-border shadow-sm p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-muted-foreground" /> Rating Distribution</h3>
                <div className="space-y-3">
                  {[5, 4, 3, 2, 1].map((r) => {
                    const count = stats?.byRating?.find((b) => b.rating === r)?.count ?? 0;
                    const pct = stats?.total ? Math.round((count / stats.total) * 100) : 0;
                    return (
                      <div key={r} className="flex items-center gap-3">
                        <div className="flex items-center gap-1 w-12 flex-shrink-0">
                          <span className="text-sm font-medium">{r}</span>
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        </div>
                        <div className="flex-1 bg-muted rounded-full h-2.5">
                          <div className="bg-amber-400 h-2.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-border shadow-sm p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2"><Globe className="w-4 h-4 text-muted-foreground" /> By Platform</h3>
                {stats?.byPlatform?.length ? (
                  <div className="space-y-3">
                    {stats.byPlatform.map((p) => {
                      const cfg = PLATFORM_CONFIG[p.platform.toLowerCase()] ?? PLATFORM_CONFIG.google!;
                      return (
                        <div key={p.platform} className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0 ${cfg.logoColor}`}>{cfg.logo}</div>
                          <div className="flex-1">
                            <div className="flex justify-between text-xs mb-0.5"><span className="font-medium capitalize">{p.platform}</span><span className="text-muted-foreground">{p.count} reviews</span></div>
                            <StarRow rating={Math.round(parseFloat(p.avg))} />
                          </div>
                          <span className="text-sm font-bold text-foreground">{p.avg}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    <Globe className="w-10 h-10 mx-auto mb-2 text-muted-foreground/20" />No reviews yet. Add a source to get started.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Sources ── */}
        {tab === "sources" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Connect your review platforms to track and manage all reviews in one place</p>
              <button onClick={() => setShowAddSource(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90">
                <Plus className="w-4 h-4" /> Add Source
              </button>
            </div>

            {sources.length === 0 ? (
              <div className="bg-white rounded-xl border border-border shadow-sm p-12 text-center">
                <Globe className="w-14 h-14 text-muted-foreground/20 mx-auto mb-4" />
                <p className="text-base font-semibold text-foreground">No review sources yet</p>
                <p className="text-sm text-muted-foreground mt-1 mb-4">Add your Google Business, Facebook, Yelp, and other platforms</p>
                <button onClick={() => setShowAddSource(true)} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90">Add Your First Source</button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {sources.map((source) => {
                  const cfg = PLATFORM_CONFIG[source.platform] ?? PLATFORM_CONFIG.google!;
                  const avg = parseFloat(source.avgRating ?? "0");
                  return (
                    <div key={source.id} className={`bg-white rounded-xl border shadow-sm p-5 ${source.isActive ? cfg.border : "border-border"}`}>
                      <div className="flex items-start gap-3 mb-4">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${cfg.logoColor}`}>{cfg.logo}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="font-semibold text-foreground text-sm">{source.name}</div>
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${source.isActive ? "bg-green-500" : "bg-gray-300"}`} />
                          </div>
                          <div className="text-xs text-muted-foreground capitalize">{source.platform}</div>
                        </div>
                        <button onClick={() => deleteSource.mutate(source.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="bg-muted/40 rounded-lg p-3">
                          <div className="text-xs text-muted-foreground">Reviews</div>
                          <div className="text-xl font-bold text-foreground">{source.reviewCount}</div>
                        </div>
                        <div className="bg-muted/40 rounded-lg p-3">
                          <div className="text-xs text-muted-foreground">Avg Rating</div>
                          <div className="text-xl font-bold text-amber-500">{avg > 0 ? avg.toFixed(1) : "—"}</div>
                        </div>
                      </div>
                      {source.reviewUrl && (
                        <a href={source.reviewUrl} target="_blank" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                          <ExternalLink className="w-3 h-3" /> View on {source.platform}
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Available platforms not yet added */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Available Platforms</div>
              <div className="grid grid-cols-3 gap-3">
                {AVAILABLE_PLATFORMS.filter((p) => !sources.find((s) => s.platform === p.key)).map((p) => (
                  <button key={p.key} onClick={() => { setAddSourcePlatform(p.key); setShowAddSource(true); }} className="flex items-center gap-3 bg-white rounded-xl border border-border shadow-sm p-4 hover:border-primary/40 transition-colors text-left group">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs flex-shrink-0 ${p.logoColor}`}>{p.logo}</div>
                    <div>
                      <div className="text-sm font-medium text-foreground capitalize group-hover:text-primary">{p.key}</div>
                      <div className="text-xs text-muted-foreground">{p.description}</div>
                    </div>
                    <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary ml-auto" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Reviews ── */}
        {tab === "reviews" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reviews..." className="pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-white outline-none focus:ring-2 focus:ring-primary/30 w-52" />
              </div>
              <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value as PlatformFilter)} className="px-3 py-2 text-sm border border-border rounded-lg bg-white outline-none">
                <option value="all">All Platforms</option>
                {AVAILABLE_PLATFORMS.map((p) => <option key={p.key} value={p.key} className="capitalize">{p.key}</option>)}
              </select>
              <select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value as RatingFilter)} className="px-3 py-2 text-sm border border-border rounded-lg bg-white outline-none">
                <option value="all">All Ratings</option>
                {[5, 4, 3, 2, 1].map((r) => <option key={r} value={String(r)}>{r} Star{r !== 1 ? "s" : ""}</option>)}
              </select>
              <div className="flex gap-1 bg-muted rounded-lg p-0.5">
                {(["all", "unanswered"] as const).map((f) => (
                  <button key={f} onClick={() => setReplyFilter(f)} className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${replyFilter === f ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"}`}>
                    {f === "all" ? "All" : "Unanswered"}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowAddReview(true)} className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:bg-muted">
                <Plus className="w-4 h-4" /> Add Review
              </button>
            </div>

            {filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-border shadow-sm p-12 text-center">
                <Star className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">No reviews found</p>
                <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters or add reviews from your sources</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((r) => (
                  <ReviewCard key={r.id} review={r} onReply={(id, text) => replyToReview.mutate({ id, reply: text })} onDelete={(id) => deleteReview.mutate(id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Request Reviews ── */}
        {tab === "request" && (
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-border shadow-sm p-6 space-y-5">
              <h3 className="font-semibold text-foreground">Send a Review Request</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Contact Name *</label>
                  <input value={requestForm.contactName} onChange={(e) => setRequestForm((f) => ({ ...f, contactName: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" placeholder="Sarah Chen" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Email</label>
                    <input type="email" value={requestForm.contactEmail} onChange={(e) => setRequestForm((f) => ({ ...f, contactEmail: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" placeholder="sarah@company.com" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Phone</label>
                    <input type="tel" value={requestForm.contactPhone} onChange={(e) => setRequestForm((f) => ({ ...f, contactPhone: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" placeholder="+1 555 0100" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Send via</label>
                    <div className="flex gap-2">
                      {(["email", "sms"] as const).map((c) => (
                        <button key={c} onClick={() => setRequestForm((f) => ({ ...f, channel: c }))} className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${requestForm.channel === c ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                          {c === "email" ? <><Mail className="w-3.5 h-3.5 inline mr-1" />Email</> : <><Phone className="w-3.5 h-3.5 inline mr-1" />SMS</>}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Review Platform</label>
                    <select value={requestForm.platform} onChange={(e) => setRequestForm((f) => ({ ...f, platform: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white outline-none">
                      {AVAILABLE_PLATFORMS.map((p) => <option key={p.key} value={p.key} className="capitalize">{p.key.charAt(0).toUpperCase() + p.key.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <button onClick={() => sendRequest.mutate(requestForm)} disabled={!requestForm.contactName || sendRequest.isPending} className="w-full py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-40 flex items-center justify-center gap-2">
                <Send className="w-4 h-4" />{sendRequest.isPending ? "Sending..." : "Send Review Request"}
              </button>
            </div>

            <div className="bg-white rounded-xl border border-border shadow-sm p-5">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-muted-foreground" /> Recent Requests</h3>
              {requests.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Send className="w-10 h-10 mx-auto mb-2 text-muted-foreground/20" />No requests sent yet
                </div>
              ) : (
                <div className="space-y-2">
                  {requests.slice(0, 8).map((r) => {
                    const cfg = PLATFORM_CONFIG[r.platform] ?? PLATFORM_CONFIG.google!;
                    return (
                      <div key={r.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 ${cfg.logoColor}`}>{cfg.logo}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground">{r.contactName}</div>
                          <div className="text-xs text-muted-foreground">{r.channel} · {r.platform} · {new Date(r.sentAt).toLocaleDateString()}</div>
                        </div>
                        <div className={`text-xs px-2 py-0.5 rounded-full font-medium border ${r.clickedAt ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                          {r.clickedAt ? "Clicked" : "Sent"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Source Modal */}
      {showAddSource && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAddSource(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Add Review Source</h3>
              <button onClick={() => setShowAddSource(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Platform</label>
                <div className="grid grid-cols-3 gap-2">
                  {AVAILABLE_PLATFORMS.map((p) => (
                    <button key={p.key} onClick={() => setAddSourcePlatform(p.key)} className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-colors ${addSourcePlatform === p.key ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold ${p.logoColor}`}>{p.logo}</div>
                      <span className="capitalize">{p.key}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Display Name *</label>
                <input value={addSourceFields.name} onChange={(e) => setAddSourceFields((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" placeholder={`My ${addSourcePlatform.charAt(0).toUpperCase() + addSourcePlatform.slice(1)} Reviews`} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Business / Profile ID</label>
                <input value={addSourceFields.businessId} onChange={(e) => setAddSourceFields((f) => ({ ...f, businessId: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" placeholder="e.g. ChIJ... for Google" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Review Link URL</label>
                <input value={addSourceFields.reviewUrl} onChange={(e) => setAddSourceFields((f) => ({ ...f, reviewUrl: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" placeholder={PLATFORM_CONFIG[addSourcePlatform]?.urlPattern ?? "https://"} />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-2 justify-end">
              <button onClick={() => setShowAddSource(false)} className="px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground">Cancel</button>
              <button onClick={() => addSource.mutate({ platform: addSourcePlatform, name: addSourceFields.name || `${addSourcePlatform} Reviews`, businessId: addSourceFields.businessId || undefined, reviewUrl: addSourceFields.reviewUrl || undefined })} disabled={addSource.isPending} className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40">
                {addSource.isPending ? "Adding..." : "Add Source"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Review Modal */}
      {showAddReview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAddReview(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Add Review</h3>
              <button onClick={() => setShowAddReview(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Platform</label>
                  <select value={newReview.platform} onChange={(e) => setNewReview((r) => ({ ...r, platform: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white outline-none">
                    {AVAILABLE_PLATFORMS.map((p) => <option key={p.key} value={p.key} className="capitalize">{p.key}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Rating</label>
                  <div className="flex gap-1 mt-1">
                    {[1, 2, 3, 4, 5].map((r) => (
                      <button key={r} onClick={() => setNewReview((n) => ({ ...n, rating: r }))} className="p-0.5">
                        <Star className={`w-6 h-6 ${r <= newReview.rating ? "text-amber-400 fill-amber-400" : "text-gray-200 fill-gray-200"}`} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Reviewer Name *</label>
                <input value={newReview.reviewer} onChange={(e) => setNewReview((r) => ({ ...r, reviewer: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" placeholder="John Smith" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Review Text</label>
                <textarea value={newReview.text} onChange={(e) => setNewReview((r) => ({ ...r, text: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 resize-none" rows={3} placeholder="Great service!" />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-2 justify-end">
              <button onClick={() => setShowAddReview(false)} className="px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground">Cancel</button>
              <button onClick={() => addReview.mutate(newReview)} disabled={!newReview.reviewer || addReview.isPending} className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40">
                {addReview.isPending ? "Adding..." : "Add Review"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
