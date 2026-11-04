begin;

create table if not exists public.client_sms_send_claims (
  job_id uuid primary key references public.client_automation_jobs(id) on delete cascade,
  client_account_id uuid not null references public.sub_accounts(id) on delete cascade,
  phone text not null check(phone ~ '^\+1[0-9]{10}$'),
  claimed_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists client_sms_send_claims_account_idx
  on public.client_sms_send_claims(client_account_id,claimed_at desc);
alter table public.client_sms_send_claims enable row level security;
revoke all on public.client_sms_send_claims from public,anon,authenticated;
grant select,insert,update on public.client_sms_send_claims to service_role;

create or replace function public.client_claim_sms_send(
  p_account uuid,p_phone text,p_job uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare claimed uuid;
begin
  if p_phone !~ '^\+1[0-9]{10}$' or not exists(
    select 1 from public.client_automation_jobs j where j.id=p_job
      and j.client_account_id=p_account and j.status='processing') then return false; end if;
  insert into public.client_sms_send_claims(job_id,client_account_id,phone)
  values(p_job,p_account,p_phone) on conflict(job_id) do nothing returning job_id into claimed;
  return coalesce(claimed=p_job,false);
end $$;
revoke all on function public.client_claim_sms_send(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.client_claim_sms_send(uuid,text,uuid) to service_role;

create or replace function public.client_mark_sms_send_sent(
  p_account uuid,p_phone text,p_job uuid)
returns void language sql security definer set search_path = '' as $$
  update public.client_sms_send_claims set sent_at=now()
  where job_id=p_job and client_account_id=p_account and phone=p_phone and sent_at is null;
$$;
revoke all on function public.client_mark_sms_send_sent(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.client_mark_sms_send_sent(uuid,text,uuid) to service_role;

commit;
notify pgrst, 'reload schema';
