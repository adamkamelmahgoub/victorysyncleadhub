import {useEffect,useState,type FormEvent} from 'react';
import {CalendarDays,Clock3} from 'lucide-react';

interface EventInfo {title:string;description:string|null;durationMinutes:number;timezone:string}
interface Availability {event:EventInfo;slots:string[]}
const base=import.meta.env.BASE_URL.replace(/\/$/,'');

export default function PublicBooking(){
  const slug=window.location.pathname.match(/^\/book\/([^/]+)$/)?.[1];
  const [data,setData]=useState<Availability|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [guest,setGuest]=useState({guestName:'',guestEmail:'',guestPhone:'',notes:''});
  const url=`${base}/api/public/booking/${encodeURIComponent(slug??'')}`;
  async function refresh(){
    setLoading(true);
    try{const response=await fetch(url,{cache:'no-store'});
      const body=await response.json() as Availability&{error?:string};
      if(!response.ok)throw Error(body.error||'Booking is unavailable.');
      setData(body);setError('');
    }catch(reason){setError(reason instanceof Error?reason.message:'Booking is unavailable.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{void refresh()},[url]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!selected)return;
    setSubmitting(true);setError('');
    try{const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({slot:selected,...guest})});
      const body=await response.json() as {error?:string};
      if(!response.ok)throw Error(body.error||'Could not book this time.');
      setConfirmed(true);
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not book this time.');
      await refresh();setSelected('');}
    finally{setSubmitting(false);}
  }
  const formatSlot=(slot:string,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('en-US',
    {...options,timeZone:data?.event.timezone??'UTC'}).format(new Date(slot));
  const dates=[...new Set(data?.slots.map(slot=>formatSlot(slot,{weekday:'short',month:'short',day:'numeric'}))??[])];
  return <main className="min-h-dvh bg-slate-50 px-4 py-8 text-slate-950 sm:py-14">
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">V</div>
        <span className="text-sm font-semibold tracking-wide">Victory Sync</span></header>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="border-b border-slate-200 p-6 sm:border-b-0 sm:border-r sm:p-8">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><CalendarDays className="h-6 w-6"/></div>
          <h1 className="text-2xl font-semibold tracking-tight">{data?.event.title??'Book a meeting'}</h1>
          {data?.event.description&&<p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{data.event.description}</p>}
          {data&&<div className="mt-5 space-y-2 text-sm text-slate-600">
            <p className="flex items-center gap-2"><Clock3 className="h-4 w-4"/>{data.event.durationMinutes} minutes</p>
            <p>Times shown in {data.event.timezone.replaceAll('_',' ')}</p>
          </div>}
        </section>
        <section className="p-6 sm:p-8">
          {loading&&<p role="status" className="text-sm text-slate-600">Loading available times...</p>}
          {!loading&&error&&<p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {confirmed?<div role="status" className="rounded-xl bg-emerald-50 p-5 text-emerald-950">
            <h2 className="text-lg font-semibold">Your meeting is booked</h2>
            <p className="mt-2 text-sm">{formatSlot(selected,{weekday:'long',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'})}</p>
          </div>:data&&<>
            <h2 className="text-lg font-semibold">Choose a time</h2>
            {dates.length===0?<p className="mt-4 text-sm text-slate-600">No times are available in the next two weeks.</p>
              :<div className="mt-4 max-h-72 space-y-4 overflow-y-auto pr-1">
                {dates.map(date=><div key={date}><h3 className="mb-2 text-sm font-medium text-slate-700">{date}</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{data.slots.filter(slot=>formatSlot(slot,{weekday:'short',month:'short',day:'numeric'})===date)
                    .map(slot=><button key={slot} type="button" aria-pressed={selected===slot} onClick={()=>setSelected(slot)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${selected===slot?'border-blue-600 bg-blue-600 text-white':'border-slate-200 text-blue-700 hover:border-blue-400'}`}>
                      {formatSlot(slot,{hour:'numeric',minute:'2-digit'})}</button>)}</div></div>)}
              </div>}
            {selected&&<form className="mt-6 space-y-3 border-t border-slate-200 pt-5" onSubmit={submit}>
              <h3 className="font-semibold">Your details</h3>
              <label className="block text-sm font-medium">Name<input required maxLength={200} value={guest.guestName} onChange={event=>setGuest(current=>({...current,guestName:event.target.value}))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/></label>
              <label className="block text-sm font-medium">Email<input required type="email" maxLength={320} value={guest.guestEmail} onChange={event=>setGuest(current=>({...current,guestEmail:event.target.value}))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/></label>
              <label className="block text-sm font-medium">Phone (optional)<input type="tel" maxLength={40} value={guest.guestPhone} onChange={event=>setGuest(current=>({...current,guestPhone:event.target.value}))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/></label>
              <label className="block text-sm font-medium">Notes (optional)<textarea maxLength={5000} rows={2} value={guest.notes} onChange={event=>setGuest(current=>({...current,notes:event.target.value}))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/></label>
              <button disabled={submitting} className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{submitting?'Booking...':'Confirm booking'}</button>
            </form>}
          </>}
        </section>
      </div>
    </div>
  </main>;
}
