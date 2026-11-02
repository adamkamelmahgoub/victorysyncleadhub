begin;

create table if not exists public.client_stop_confirmation_claims (
  client_account_id uuid not null references public.sub_accounts(id) on delete cascade,
  phone text not null check(phone ~ '^\+1[0-9]{10}$'),
  job_id uuid not null,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key(client_account_id,phone)
);
alter table public.client_stop_confirmation_claims enable row level security;
revoke all on public.client_stop_confirmation_claims from public,anon,authenticated;
grant select,insert,update on public.client_stop_confirmation_claims to service_role;

create or replace function public.client_claim_stop_confirmation(
  p_account uuid,p_phone text,p_job uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare claimed uuid;
begin
  if p_phone !~ '^\+1[0-9]{10}$' or not exists(
    select 1 from public.client_automation_jobs j where j.id=p_job
      and j.client_account_id=p_account and j.kind='stop_confirmation'
      and j.status='processing'
      and right(regexp_replace(coalesce(j.payload->>'phone',''),'[^0-9]','','g'),10)=right(p_phone,10)
  ) then return false; end if;
  insert into public.client_stop_confirmation_claims(client_account_id,phone,job_id)
  values(p_account,p_phone,p_job) on conflict(client_account_id,phone) do nothing
  returning job_id into claimed;
  return coalesce(claimed=p_job,false);
end $$;
revoke all on function public.client_claim_stop_confirmation(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.client_claim_stop_confirmation(uuid,text,uuid) to service_role;

create or replace function public.client_mark_stop_confirmation_sent(
  p_account uuid,p_phone text,p_job uuid)
returns void language sql security definer set search_path = '' as $$
  update public.client_stop_confirmation_claims set sent_at=now()
  where client_account_id=p_account and phone=p_phone and job_id=p_job and sent_at is null;
$$;
revoke all on function public.client_mark_stop_confirmation_sent(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.client_mark_stop_confirmation_sent(uuid,text,uuid) to service_role;

commit;
