import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Account = { id:string; name:string; health_score:number; leads_this_week:number; overdue_tasks:number; failed_payments:number };
type AccountResponse = { accounts:Account[]; selected:{accountId:string|null;viewAsClient:boolean}|null };

export function AccountSwitcher() {
  const { role } = useAuth();
  const [,navigate] = useLocation();
  const queryClient = useQueryClient();
  const {data,error} = useQuery<AccountResponse>({queryKey:['portal-accounts'],
    queryFn:() => apiFetch('/api/portal?action=accounts'),retry:false,
    enabled:role !== 'no_access'});
  if (error || !data || !data.accounts.length) return null;
  const agency = ['owner','admin','member','viewer','agent','agency_admin','agency_staff'].includes(role);
  async function select(value:string) {
    await apiFetch('/api/portal',{method:'POST',body:JSON.stringify({action:'switch',accountId:value || null,viewAsClient:false})});
    await queryClient.invalidateQueries({queryKey:['portal']});
    await queryClient.invalidateQueries({queryKey:['portal-accounts']});
    navigate(value ? '/client-portal/dashboard' : '/client-portal');
  }
  return <label className="flex items-center gap-2 text-xs text-slate-600">
    <span className="hidden lg:inline">Account</span>
    <select aria-label="Selected client account" className="max-w-48 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
      value={data.selected?.accountId ?? (data.accounts.length === 1 && !agency ? data.accounts[0].id : '')}
      onChange={event => void select(event.target.value)}>
      {agency && <option value="">Agency view</option>}
      {data.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
    </select>
  </label>;
}
