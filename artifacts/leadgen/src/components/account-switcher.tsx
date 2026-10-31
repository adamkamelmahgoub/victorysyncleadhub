import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useState } from 'react';

type Account = { id:string; name:string; health_score:number; leads_this_week:number; overdue_tasks:number; failed_payments:number };
type AccountResponse = { accounts:Account[]; selected:{accountId:string|null;viewAsClient:boolean}|null };

export function AccountSwitcher({variant='header'}:{variant?:'header'|'sidebar'}) {
  const { role } = useAuth();
  const [search,setSearch]=useState('');
  const [,navigate] = useLocation();
  const queryClient = useQueryClient();
  const {data,error} = useQuery<AccountResponse>({queryKey:['portal-accounts'],
    queryFn:() => apiFetch('/api/portal?action=accounts'),retry:false,
    enabled:role !== 'no_access'});
  if (error || !data || !data.accounts.length) return null;
  const agency = ['owner','admin','member','viewer','agent','agency_admin','agency_staff'].includes(role);
  const selectedId=data.selected?.accountId ?? (data.accounts.length === 1 && !agency ? data.accounts[0].id : '');
  const visible=data.accounts.filter(account=>account.id===selectedId||account.name.toLowerCase().includes(search.trim().toLowerCase()));
  async function select(value:string) {
    await apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'switch',accountId:value || null,viewAsClient:false})});
    queryClient.clear();
    navigate(value ? '/client-portal/dashboard' : '/client-portal');
  }
  return <div className={variant==='sidebar'?'space-y-2':'flex min-w-0 items-center gap-2'}>
    {variant==='sidebar'&&agency&&data.accounts.length>4&&<input aria-label="Search client accounts" placeholder="Search accounts" value={search}
      onChange={event=>setSearch(event.target.value)} className="h-9 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-white outline-none placeholder:text-slate-400 focus:border-blue-500"/>}
    <label className="block min-w-0 flex-1 text-xs"><span className="sr-only">Selected client account</span>
    <select aria-label="Selected client account" className={variant==='sidebar'
      ?'h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm font-medium text-white outline-none focus:border-blue-500'
      :'h-10 max-w-[min(54vw,240px)] rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'}
      value={selectedId}
      onChange={event => void select(event.target.value)}>
      {agency && <option value="">Agency view</option>}
      {visible.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
    </select></label>
  </div>;
}
