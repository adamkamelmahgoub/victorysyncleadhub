import { supabase } from "./supabase";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const sessionKey = "victorysync_activity_session";
const savedSessionId = sessionStorage.getItem(sessionKey);
const sessionId = savedSessionId || crypto.randomUUID();
if (!savedSessionId) {
  sessionStorage.setItem(sessionKey, sessionId);
}

type ActivityEvent = Record<string, unknown> & { eventType: string; action: string; sessionId: string };
const pending: ActivityEvent[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let inflight: Promise<void> | undefined;

async function sendBatch(events: ActivityEvent[]) {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await fetch(`${BASE}/api/activity/events`, {
      method: "POST",
      keepalive: true,
      headers: { authorization: `Bearer ${data.session.access_token}`, "content-type": "application/json" },
      body: JSON.stringify({ events }),
    });
  } catch {
    // Activity telemetry must never break an operator action.
  }
}

function scheduleFlush() {
  if (timer) return;
  timer = setTimeout(() => { timer = undefined; void flushActivity(); }, pending.length >= 20 ? 0 : 750);
}

async function flushActivity(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = undefined; }
  if (inflight) {
    await inflight;
    if (pending.length) await flushActivity();
    return;
  }
  const events = pending.splice(0, 20);
  if (!events.length) return;
  inflight = sendBatch(events);
  await inflight;
  inflight = undefined;
  if (pending.length) scheduleFlush();
}

export async function recordActivity(eventType: string, action: string, details: Record<string, unknown> = {}) {
  pending.push({ eventType, action, sessionId, ...details });
  if (eventType === "authentication") await flushActivity();
  else scheduleFlush();
}

window.addEventListener("pagehide", () => { void flushActivity(); });
