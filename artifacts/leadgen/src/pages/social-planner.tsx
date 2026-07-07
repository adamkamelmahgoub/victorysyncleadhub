import { useState } from "react";
import {
  Calendar, Plus, Image, Link2, Clock, CheckCircle,
  MoreHorizontal, ThumbsUp, MessageSquare, Share2, Eye,
  Linkedin, Twitter, Facebook,
} from "lucide-react";
import { format, addDays, startOfWeek, eachDayOfInterval } from "date-fns";

type Platform = "facebook" | "instagram" | "linkedin" | "twitter" | "google";
type PostStatus = "scheduled" | "published" | "draft" | "failed";

interface Post {
  id: number;
  content: string;
  platforms: Platform[];
  status: PostStatus;
  scheduledAt: string;
  imageUrl?: string;
  stats?: { likes: number; comments: number; shares: number; reach: number };
}

const PLATFORM_STYLES: Record<Platform, { label: string; color: string; bg: string }> = {
  facebook: { label: "Facebook", color: "text-blue-600", bg: "bg-blue-100" },
  instagram: { label: "Instagram", color: "text-pink-600", bg: "bg-pink-100" },
  linkedin: { label: "LinkedIn", color: "text-blue-700", bg: "bg-blue-100" },
  twitter: { label: "X (Twitter)", color: "text-gray-900", bg: "bg-gray-100" },
  google: { label: "Google", color: "text-red-600", bg: "bg-red-100" },
};

const STATUS_STYLES: Record<PostStatus, string> = {
  scheduled: "bg-blue-100 text-blue-700 border-blue-200",
  published: "bg-green-100 text-green-700 border-green-200",
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  failed: "bg-red-100 text-red-600 border-red-200",
};

const now = new Date();
const SAMPLE_POSTS: Post[] = [
  {
    id: 1,
    content: "🚀 Exciting news! We just hit 1,000 customers. Thank you to everyone who believed in us from day one. Here's to the next milestone! #growth #SaaS #grateful",
    platforms: ["facebook", "instagram", "linkedin"],
    status: "published",
    scheduledAt: addDays(now, -2).toISOString(),
    stats: { likes: 142, comments: 23, shares: 18, reach: 2847 },
  },
  {
    id: 2,
    content: "Sales tip: The best time to follow up is within 5 minutes of a lead showing interest. Our automation does this for you automatically. Learn more 👇",
    platforms: ["linkedin", "twitter"],
    status: "published",
    scheduledAt: addDays(now, -1).toISOString(),
    stats: { likes: 67, comments: 8, shares: 31, reach: 1204 },
  },
  {
    id: 3,
    content: "Did you know? Companies that automate their lead follow-up see a 451% increase in qualified leads. VictorySync makes this easy. Start your free trial today!",
    platforms: ["facebook", "instagram"],
    status: "scheduled",
    scheduledAt: addDays(now, 1).toISOString(),
  },
  {
    id: 4,
    content: "New feature alert! 🎉 Introducing our AI-powered email personalization. Every message now feels 1:1, at scale. Check it out in your dashboard.",
    platforms: ["facebook", "instagram", "linkedin", "twitter"],
    status: "scheduled",
    scheduledAt: addDays(now, 3).toISOString(),
  },
  {
    id: 5,
    content: "Weekly insight: The top performing cold email subject lines this month all had one thing in common — personalization. Read our full breakdown on the blog.",
    platforms: ["linkedin"],
    status: "draft",
    scheduledAt: addDays(now, 5).toISOString(),
  },
];

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "twitter", label: "X (Twitter)" },
  { id: "google", label: "Google Business" },
];

export default function SocialPlanner() {
  const [posts, setPosts] = useState(SAMPLE_POSTS);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [showNew, setShowNew] = useState(false);
  const [newPost, setNewPost] = useState({ content: "", platforms: [] as Platform[], scheduledAt: format(addDays(now, 1), "yyyy-MM-dd'T'HH:mm") });
  const [filterStatus, setFilterStatus] = useState<PostStatus | "all">("all");

  const weekStart = startOfWeek(now);
  const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });

  const filtered = posts.filter((p) => filterStatus === "all" || p.status === filterStatus);

  const published = posts.filter((p) => p.status === "published");
  const totalReach = published.reduce((s, p) => s + (p.stats?.reach ?? 0), 0);
  const totalEngagement = published.reduce((s, p) => s + (p.stats?.likes ?? 0) + (p.stats?.comments ?? 0) + (p.stats?.shares ?? 0), 0);

  function createPost() {
    if (!newPost.content.trim() || newPost.platforms.length === 0) return;
    setPosts((prev) => [
      { id: Date.now(), ...newPost, status: "scheduled" as PostStatus, scheduledAt: new Date(newPost.scheduledAt).toISOString() },
      ...prev,
    ]);
    setNewPost({ content: "", platforms: [], scheduledAt: format(addDays(now, 1), "yyyy-MM-dd'T'HH:mm") });
    setShowNew(false);
  }

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Social Planner</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Schedule and manage posts across all your social channels</p>
          </div>
          <div className="flex gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden bg-white">
              {(["list", "calendar"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${view === v ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}>
                  {v}
                </button>
              ))}
            </div>
            <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90">
              <Plus className="w-4 h-4" /> Create Post
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total Reach", value: totalReach.toLocaleString(), sub: "Across all platforms", color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Engagement", value: totalEngagement.toLocaleString(), sub: "Likes + comments + shares", color: "text-purple-600", bg: "bg-purple-50" },
            { label: "Scheduled", value: posts.filter((p) => p.status === "scheduled").length, sub: "Upcoming posts", color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Published", value: published.length, sub: "All time", color: "text-green-600", bg: "bg-green-50" },
          ].map((s) => (
            <div key={s.label} className={`bg-white rounded-xl border border-border shadow-sm p-4`}>
              <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[11px] text-muted-foreground/70 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          {(["all", "scheduled", "published", "draft", "failed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border capitalize transition-colors ${filterStatus === s ? "bg-primary text-white border-primary" : "bg-white border-border text-muted-foreground hover:border-primary/40"}`}
            >
              {s}
            </button>
          ))}
        </div>

        {view === "list" ? (
          <div className="space-y-3">
            {filtered.map((post) => (
              <div key={post.id} className="bg-white rounded-xl border border-border shadow-sm p-5">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {post.platforms.map((p) => (
                        <span key={p} className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${PLATFORM_STYLES[p].bg} ${PLATFORM_STYLES[p].color}`}>
                          {PLATFORM_STYLES[p].label}
                        </span>
                      ))}
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ml-auto ${STATUS_STYLES[post.status]}`}>
                        {post.status}
                      </span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{post.content}</p>
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      {post.status === "published" ? "Published" : "Scheduled for"} {format(new Date(post.scheduledAt), "MMM d, yyyy 'at' h:mm a")}
                    </div>
                  </div>
                  <button className="p-1.5 rounded hover:bg-muted text-muted-foreground flex-shrink-0">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
                {post.stats && (
                  <div className="mt-4 pt-4 border-t border-border flex gap-6">
                    {[
                      { icon: ThumbsUp, label: "Likes", value: post.stats.likes },
                      { icon: MessageSquare, label: "Comments", value: post.stats.comments },
                      { icon: Share2, label: "Shares", value: post.stats.shares },
                      { icon: Eye, label: "Reach", value: post.stats.reach.toLocaleString() },
                    ].map((s) => (
                      <div key={s.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <s.icon className="w-3.5 h-3.5" />
                        <span className="font-semibold text-foreground">{s.value}</span> {s.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border">
              {weekDays.map((day) => (
                <div key={day.toISOString()} className="p-3 border-r border-border last:border-0 text-center">
                  <div className="text-xs text-muted-foreground">{format(day, "EEE")}</div>
                  <div className={`text-sm font-bold mt-0.5 ${format(day, "yyyy-MM-dd") === format(now, "yyyy-MM-dd") ? "text-primary" : "text-foreground"}`}>
                    {format(day, "d")}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 min-h-[400px]">
              {weekDays.map((day) => {
                const dayPosts = posts.filter((p) => format(new Date(p.scheduledAt), "yyyy-MM-dd") === format(day, "yyyy-MM-dd"));
                return (
                  <div key={day.toISOString()} className="p-2 border-r border-border last:border-0 min-h-32">
                    {dayPosts.map((post) => (
                      <div key={post.id} className={`text-[10px] p-1.5 rounded mb-1 cursor-pointer ${post.status === "published" ? "bg-green-100 text-green-700" : post.status === "scheduled" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                        <div className="font-medium truncate">{post.content.slice(0, 30)}...</div>
                        <div className="flex gap-0.5 mt-0.5 flex-wrap">
                          {post.platforms.slice(0, 3).map((p) => (
                            <span key={p} className="opacity-70">{p[0]?.toUpperCase()}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                    <button onClick={() => setShowNew(true)} className="w-full text-[10px] text-muted-foreground/50 hover:text-primary p-1 rounded hover:bg-primary/5">+</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Create Post</h3>
              <button onClick={() => setShowNew(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Platforms</label>
                <div className="flex gap-2 flex-wrap">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setNewPost((n) => ({
                        ...n,
                        platforms: n.platforms.includes(p.id) ? n.platforms.filter((x) => x !== p.id) : [...n.platforms, p.id],
                      }))}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${newPost.platforms.includes(p.id) ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Post Content</label>
                <textarea
                  value={newPost.content}
                  onChange={(e) => setNewPost((n) => ({ ...n, content: e.target.value }))}
                  rows={5}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  placeholder="What do you want to share?"
                />
                <div className="flex justify-between mt-1">
                  <div className="flex gap-2 text-muted-foreground">
                    <button className="p-1 rounded hover:bg-muted"><Image className="w-4 h-4" /></button>
                    <button className="p-1 rounded hover:bg-muted"><Link2 className="w-4 h-4" /></button>
                  </div>
                  <span className="text-xs text-muted-foreground">{newPost.content.length}/280</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Schedule Date & Time</label>
                  <input
                    type="datetime-local"
                    value={newPost.scheduledAt}
                    onChange={(e) => setNewPost((n) => ({ ...n, scheduledAt: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-2 justify-end">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted">Cancel</button>
              <button
                onClick={() => setNewPost((n) => ({ ...n, scheduledAt: format(now, "yyyy-MM-dd'T'HH:mm") }))}
                className="px-4 py-2 text-sm font-medium border border-primary text-primary rounded-lg hover:bg-primary/5"
              >
                Save as Draft
              </button>
              <button
                onClick={createPost}
                disabled={!newPost.content.trim() || newPost.platforms.length === 0}
                className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40"
              >
                Schedule Post
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
