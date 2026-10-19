import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { workspaceInput } from "@/components/page-layout";
import { ReportHeader, ReportMetric, ReportMetrics, ReportPanel } from "@/components/report-layout";

type Call = { id: number; lead_id: string; created_at: string; disposition: string; connected: boolean | null; conversation: boolean | null; meeting_held_at: string | null };
type Reply = { id: string; from_email: string; subject: string; body: string; received_at: string; positive_reply: boolean | null };
type Report = { calls: { dials: number; connects: number; conversations: number; meetingsBooked: number; meetingsHeld: number; unclassified: number }; email: Array<{ mailbox: string; sent: number; delivered: number; open_rate: null; reply_rate: number | null; positive_reply_rate: number | null; bounce_rate: number | null }>; callReview: Call[]; replyReview: Reply[] };
const percent = (value: number | null) => value === null ? "—" : `${(Number(value) * 100).toFixed(1)}%`;
function monday() { const date = new Date(); date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7); return date.toISOString().slice(0, 10); }

function CallOutcome({ call, save, disabled }: { call: Call; save: (data: unknown) => Promise<unknown>; disabled: boolean }) {
  const [connected, setConnected] = useState(call.connected ?? false);
  const [conversation, setConversation] = useState(call.conversation ?? false);
  const [held, setHeld] = useState(call.meeting_held_at?.slice(0, 16) ?? "");
  return <tr>
    <td><span className="block whitespace-nowrap">{new Date(call.created_at).toLocaleString()}</span><Link className="text-xs text-blue-700 hover:underline" href={`/leads/${call.lead_id}`}>View contact</Link></td>
    <td className="capitalize">{call.disposition.replaceAll("_", " ")}</td>
    <td><input aria-label="Call connected" type="checkbox" checked={connected} onChange={event => { setConnected(event.target.checked); if (!event.target.checked) setConversation(false); }} /></td>
    <td><input aria-label="Conversation" type="checkbox" checked={conversation} onChange={event => { setConversation(event.target.checked); if (event.target.checked) setConnected(true); }} /></td>
    <td>{call.disposition === "meeting_booked" ? <input aria-label="Meeting held at UTC" className={workspaceInput} type="datetime-local" value={held} onChange={event => setHeld(event.target.value)} /> : "—"}</td>
    <td><button className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-slate-50 disabled:opacity-50" disabled={disabled} onClick={() => save({ id: call.id, connected, conversation, meetingHeldAt: held ? `${held}:00Z` : null })}>Save</button>{call.connected === null && <span className="block text-xs text-amber-700">Unclassified</span>}</td>
  </tr>;
}

export default function OutreachWeekly() {
  const [week, setWeek] = useState(monday);
  const cache = useQueryClient();
  const { data, error, isLoading } = useQuery<Report>({ queryKey: ["outreach-weekly", week], queryFn: () => apiFetch(`/email/metrics/${week}`), enabled: /^\d{4}-\d{2}-\d{2}$/.test(week) });
  const mutation = useMutation({ mutationFn: ({ action, data }: { action: string; data: unknown }) => apiFetch(`/email/metrics/${action}`, { method: "POST", body: JSON.stringify(data) }), onSuccess: () => cache.invalidateQueries({ queryKey: ["outreach-weekly"] }) });
  return <div className="page-stack">
    <ReportHeader title="Weekly outreach" description="Calls, email results, and outcomes for a seven-day UTC week." actions={<label className="flex items-center gap-2 text-xs font-medium text-slate-600">Week starting <input className={workspaceInput} type="date" value={week} onChange={event => setWeek(event.target.value)} /></label>} />
    {isLoading && <p role="status" className="text-sm text-slate-500">Loading outreach totals…</p>}
    {(error || mutation.error) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{(error ?? mutation.error)?.message}</p>}
    {data && <>
      <ReportMetrics>
        <ReportMetric label="Dials" value={data.calls.dials.toLocaleString()} />
        <ReportMetric label="Connects" value={data.calls.connects.toLocaleString()} />
        <ReportMetric label="Conversations" value={data.calls.conversations.toLocaleString()} />
        <ReportMetric label="Meetings booked" value={data.calls.meetingsBooked.toLocaleString()} detail={`${data.calls.meetingsHeld.toLocaleString()} held`} />
      </ReportMetrics>
      <ReportPanel title="Email performance" description="Results by mailbox for messages sent during this UTC week.">
        <div className="overflow-x-auto"><table className="workspace-table min-w-[800px] w-full text-sm"><thead><tr>{["Mailbox", "Sent", "Delivered", "Open rate", "Reply rate", "Positive reply", "Hard bounce"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{data.email.map(row => <tr key={row.mailbox}><td className="font-medium">{row.mailbox}</td><td>{row.sent.toLocaleString()}</td><td>{row.delivered.toLocaleString()}</td><td>Unavailable</td><td>{percent(row.reply_rate)}</td><td>{percent(row.positive_reply_rate)}</td><td>{percent(row.bounce_rate)}</td></tr>)}</tbody></table></div>
        {!data.email.length && <p className="py-6 text-center text-sm text-slate-500">No email activity for this week.</p>}
        <p className="mt-4 text-xs leading-5 text-slate-500">Delivery and bounce results can arrive after the send date. Reply rates count unique recipients and can change as replies arrive. Open tracking is disabled.</p>
      </ReportPanel>
      <details className="rounded-xl border border-slate-200 bg-white shadow-sm"><summary className="cursor-pointer px-5 py-4 text-sm font-semibold">Review call outcomes <span className="ml-2 text-xs font-normal text-slate-500">{data.callReview.length} calls</span></summary><div className="border-t px-5 py-4"><p className="mb-4 text-xs text-slate-500">Classify calls and record meetings held. Held times are UTC.</p><div className="overflow-x-auto"><table className="workspace-table min-w-[760px] w-full text-sm"><thead><tr><th>Call</th><th>Disposition</th><th>Connected</th><th>Conversation</th><th>Meeting held (UTC)</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{data.callReview.map(call => <CallOutcome key={`${call.id}:${call.connected}:${call.conversation}:${call.meeting_held_at}`} call={call} disabled={mutation.isPending} save={values => mutation.mutateAsync({ action: "call-outcome", data: values })} />)}</tbody></table></div>{!data.callReview.length && <p className="py-5 text-sm text-slate-500">No calls to review.</p>}</div></details>
      <details className="rounded-xl border border-slate-200 bg-white shadow-sm"><summary className="cursor-pointer px-5 py-4 text-sm font-semibold">Review replies <span className="ml-2 text-xs font-normal text-slate-500">{data.replyReview.length} replies</span></summary><div className="space-y-3 border-t px-5 py-4"><p className="text-xs text-slate-500">Positive means the contact expressed interest in continuing the conversation.</p>{data.replyReview.map(reply => <div key={reply.id} className="rounded-lg border border-slate-200 p-4"><p className="text-sm font-medium">{reply.from_email} · {reply.subject}</p><p className="mt-1 text-xs text-slate-500">{new Date(reply.received_at).toLocaleString()}</p><details className="mt-3"><summary className="cursor-pointer text-xs text-blue-700">Read reply</summary><p className="mt-2 whitespace-pre-wrap text-sm">{reply.body}</p></details><select aria-label={`Reply outcome from ${reply.from_email}`} className={`${workspaceInput} mt-3 max-w-44`} disabled={mutation.isPending} value={reply.positive_reply === null ? "" : String(reply.positive_reply)} onChange={event => mutation.mutate({ action: "reply-outcome", data: { id: reply.id, positive: event.target.value === "true" } })}><option value="" disabled>Unclassified</option><option value="true">Positive</option><option value="false">Not positive</option></select></div>)}{!data.replyReview.length && <p className="py-5 text-sm text-slate-500">No replies to review.</p>}</div></details>
    </>}
  </div>;
}
