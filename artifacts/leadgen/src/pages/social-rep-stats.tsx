import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {PageHeader} from '@/components/page-layout';
import {apiFetch} from '@/lib/api';

type Stats={days:number;timezone:string;messages:{outbound:number;inbound:number;interested:number};
  tasks:{planned:number;due:number;completed:number;skipped:number};response:{contacted:number;replied:number;median_reply_hours:number|null};
  obligations:{reply_owed:number;overdue:number;late_completed:number;median_reply_minutes:number|null};
  accounts:Array<{id:string;label:string;platform:string;status:string;health:string;sent:number;replies:number;interested:number;unmatched:number;last_sync_at:string|null}>;
  daily:Array<{activity_day:string;sent:number;replies:number}>;campaigns:Array<{name:string;enrolled:number;sent:number;replied:number}>};
const card='rounded-xl border border-border bg-card p-5 shadow-sm';
export default function SocialRepStats(){
  const [days,setDays]=useState(30);
  const report=useQuery<Stats>({queryKey:['social-rep-stats',days],queryFn:()=>apiFetch(`/api/social-rep-stats?days=${days}`)});
  const r=report.data,rate=r?.response.contacted?Math.round(r.response.replied/r.response.contacted*100):0;
  return <div className="page-stack space-y-5"><PageHeader title="My DM stats" description="Your own outreach activity, replies, queue, and connected accounts."/>
    <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm"><p className="text-sm text-muted-foreground">Activity is attributed to accounts connected to you.</p><select aria-label="Stats period" className="rounded-lg border border-input bg-background px-3 py-2 text-sm" value={days} onChange={e=>setDays(Number(e.target.value))}>{[7,30,90,365].map(value=><option key={value} value={value}>Last {value} days</option>)}</select></div>
    {report.isError&&<p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{String(report.error)}</p>}
    {report.isLoading&&<p className="text-sm text-muted-foreground">Loading your stats...</p>}
    {r&&<><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ['Sent messages',r.messages.outbound],['Received replies',r.messages.inbound],['Reply rate',`${rate}%`],['Interested threads',r.messages.interested],
      ['Tasks completed',r.tasks.completed],['Tasks due',r.tasks.due],['Tasks skipped',r.tasks.skipped],['Median first reply',r.response.median_reply_hours===null?'No data':`${r.response.median_reply_hours} h`],
      ['Replies owed',r.obligations.reply_owed],['Overdue replies',r.obligations.overdue],['Late replies',r.obligations.late_completed],
      ['Median reply speed',r.obligations.median_reply_minutes===null?'No data':`${r.obligations.median_reply_minutes} min`],
    ].map(([label,value])=><div key={label} className={card}><div className="text-2xl font-semibold tabular-nums">{value}</div><div className="mt-1 text-xs text-muted-foreground">{label}</div></div>)}</div>
    <div className="grid gap-5 xl:grid-cols-2"><section className={card}><h2 className="font-semibold">My accounts</h2><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="pb-2">Account</th><th>Sent</th><th>Replies</th><th>Interested</th><th>Health</th></tr></thead><tbody>{r.accounts.map(a=><tr key={a.id} className="border-t"><td className="py-2"><strong>{a.label}</strong><div className="text-xs capitalize text-muted-foreground">{a.platform}</div></td><td>{a.sent}</td><td>{a.replies}</td><td>{a.interested}</td><td className="capitalize">{a.health}</td></tr>)}</tbody></table></div>{!r.accounts.length&&<p className="mt-3 text-sm text-muted-foreground">Connect your account in Settings to see activity here.</p>}</section>
    <section className={card}><h2 className="font-semibold">My campaigns</h2><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="pb-2">Campaign</th><th>Enrolled</th><th>Sent</th><th>Replied</th></tr></thead><tbody>{r.campaigns.map(c=><tr key={c.name} className="border-t"><td className="py-2 font-medium">{c.name}</td><td>{c.enrolled}</td><td>{c.sent}</td><td>{c.replied}</td></tr>)}</tbody></table></div>{!r.campaigns.length&&<p className="mt-3 text-sm text-muted-foreground">Campaign results appear after tasks are completed.</p>}</section></div>
    <section className={card}><h2 className="font-semibold">Daily activity</h2><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="pb-2">Day</th><th>Sent</th><th>Replies</th></tr></thead><tbody>{r.daily.map(day=><tr key={day.activity_day} className="border-t"><td className="py-2">{day.activity_day}</td><td>{day.sent}</td><td>{day.replies}</td></tr>)}</tbody></table></div><p className="mt-3 text-xs text-muted-foreground">Dates use {r.timezone}. Reply rate uses conversations with an inbound reply after their first recorded outbound message.</p></section></>}
  </div>;
}
