import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  Star, TrendingUp, Send, ThumbsUp, MessageSquare,
  Search, Filter, ExternalLink, RefreshCw, ChevronDown,
} from "lucide-react";

interface Review {
  id: number;
  reviewer: string;
  platform: "Google" | "Facebook" | "Yelp" | "G2";
  rating: number;
  text: string;
  date: string;
  replied: boolean;
}

const REVIEWS: Review[] = [
  { id: 1, reviewer: "Sarah Chen", platform: "Google", rating: 5, text: "Absolutely love this platform. The automation features alone have saved our team hours every week. The lead finder is incredibly accurate.", date: "2025-07-01", replied: false },
  { id: 2, reviewer: "Marcus Rivera", platform: "G2", rating: 5, text: "Best CRM I've used in 10 years. The pipeline view is clean and intuitive. Support team is extremely responsive.", date: "2025-06-28", replied: true },
  { id: 3, reviewer: "Priya Patel", platform: "Google", rating: 4, text: "Great tool overall. The sequences feature is exactly what we needed for our outreach campaigns. Would love more integrations.", date: "2025-06-25", replied: false },
  { id: 4, reviewer: "James O'Brien", platform: "Facebook", rating: 5, text: "Game changer for our agency. Managing multiple client pipelines in one place is seamless. Highly recommend.", date: "2025-06-22", replied: true },
  { id: 5, reviewer: "Elena Vasquez", platform: "G2", rating: 3, text: "Good platform but the learning curve is steep. The documentation could be better. Once you get past setup it's quite powerful.", date: "2025-06-18", replied: false },
  { id: 6, reviewer: "David Kim", platform: "Yelp", rating: 5, text: "Switched from another CRM and never looked back. The calendar and conversations features are exactly what we were missing.", date: "2025-06-14", replied: true },
  { id: 7, reviewer: "Amara Osei", platform: "Google", rating: 4, text: "Solid platform. The email sequences are great for our cold outreach. Minor UI issues but nothing major.", date: "2025-06-10", replied: false },
];

const PLATFORM_COLORS: Record<string, string> = {
  Google: "bg-red-50 text-red-600 border-red-200",
  Facebook: "bg-blue-50 text-blue-600 border-blue-200",
  Yelp: "bg-red-50 text-red-600 border-red-200",
  G2: "bg-orange-50 text-orange-600 border-orange-200",
};

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map((i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= rating ? "text-amber-400 fill-amber-400" : "text-gray-200 fill-gray-200"}`} />
      ))}
    </div>
  );
}

export default function Reputation() {
  const [reviews, setReviews] = useState(REVIEWS);
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<"all" | "unanswered" | "5" | "4" | "3" | "2" | "1">("all");
  const [search, setSearch] = useState("");

  const avg = (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1);
  const dist = [5,4,3,2,1].map((r) => ({ r, count: reviews.filter((rev) => rev.rating === r).length }));

  const filtered = reviews.filter((r) => {
    if (filter === "unanswered") return !r.replied;
    if (["5","4","3","2","1"].includes(filter)) return r.rating === parseInt(filter);
    if (search) return r.reviewer.toLowerCase().includes(search.toLowerCase()) || r.text.toLowerCase().includes(search.toLowerCase());
    return true;
  });

  function sendReply(id: number) {
    if (!replyText[id]?.trim()) return;
    setReviews((prev) => prev.map((r) => r.id === id ? { ...r, replied: true } : r));
    setReplyText((prev) => ({ ...prev, [id]: "" }));
  }

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Reputation Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Monitor and respond to your reviews across all platforms</p>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-3 py-2 border border-border bg-white text-sm font-medium text-foreground rounded-lg hover:bg-muted transition-colors">
              <RefreshCw className="w-4 h-4" /> Sync Reviews
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors">
              <Send className="w-4 h-4" /> Request Reviews
            </button>
          </div>
        </div>

        {/* Overview */}
        <div className="grid grid-cols-[280px_1fr_1fr_1fr] gap-4">
          {/* Rating summary */}
          <div className="bg-white rounded-xl border border-border shadow-sm p-5">
            <div className="text-center mb-4">
              <div className="text-5xl font-bold text-foreground">{avg}</div>
              <div className="flex justify-center my-2">
                {[1,2,3,4,5].map((i) => (
                  <Star key={i} className={`w-5 h-5 ${i <= Math.round(parseFloat(avg)) ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />
                ))}
              </div>
              <div className="text-xs text-muted-foreground">{reviews.length} reviews</div>
            </div>
            <div className="space-y-1.5">
              {dist.map(({ r, count }) => (
                <div key={r} className="flex items-center gap-2">
                  <div className="flex gap-0.5 flex-shrink-0">
                    {[1,2,3,4,5].map((i) => <Star key={i} className={`w-2.5 h-2.5 ${i <= r ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />)}
                  </div>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(count / reviews.length) * 100}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-3">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {[
            { label: "Response Rate", value: `${Math.round((reviews.filter(r=>r.replied).length / reviews.length) * 100)}%`, sub: `${reviews.filter(r=>r.replied).length} of ${reviews.length} reviewed`, icon: ThumbsUp, color: "text-green-600", bg: "bg-green-50" },
            { label: "Unanswered", value: reviews.filter(r=>!r.replied).length, sub: "Awaiting your response", icon: MessageSquare, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Avg. Rating", value: avg, sub: "Across all platforms", icon: Star, color: "text-primary", bg: "bg-orange-50" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-border shadow-sm p-5 flex gap-4 items-start">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg} flex-shrink-0`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{s.value}</div>
                <div className="text-xs font-medium text-muted-foreground">{s.label}</div>
                <div className="text-[11px] text-muted-foreground/70 mt-0.5">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reviews..." className="pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-white outline-none focus:ring-2 focus:ring-primary/30 w-56" />
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden bg-white">
            {(["all","unanswered","5","4","3","2","1"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-2 text-xs font-medium capitalize transition-colors border-r border-border last:border-0 ${filter === f ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}>
                {f === "unanswered" ? "Unanswered" : f === "all" ? "All" : `${f}★`}
              </button>
            ))}
          </div>
        </div>

        {/* Reviews list */}
        <div className="space-y-3">
          {filtered.map((review) => (
            <div key={review.id} className="bg-white rounded-xl border border-border shadow-sm p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                  {review.reviewer.split(" ").map(n => n[0]).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-foreground text-sm">{review.reviewer}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${PLATFORM_COLORS[review.platform]}`}>{review.platform}</span>
                    <StarRow rating={review.rating} />
                    <span className="text-xs text-muted-foreground ml-auto">{review.date}</span>
                  </div>
                  <p className="text-sm text-foreground mt-2 leading-relaxed">{review.text}</p>

                  {review.replied ? (
                    <div className="mt-3 pl-4 border-l-2 border-primary/30">
                      <div className="text-xs font-medium text-primary mb-1">Your response</div>
                      <p className="text-xs text-muted-foreground">Thank you so much for your kind words! We're thrilled to hear that our platform is making a difference for your team. We're constantly working to improve and your feedback means a lot to us.</p>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={replyText[review.id] ?? ""}
                        onChange={(e) => setReplyText((prev) => ({ ...prev, [review.id]: e.target.value }))}
                        placeholder="Write a response..."
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 resize-none bg-background"
                      />
                      <div className="flex gap-2 justify-end">
                        <button className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground border border-border rounded-lg">
                          Use Template
                        </button>
                        <button
                          onClick={() => sendReply(review.id)}
                          disabled={!replyText[review.id]?.trim()}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-white rounded-lg disabled:opacity-40 hover:bg-primary/90 transition-colors"
                        >
                          <Send className="w-3 h-3" /> Reply
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
