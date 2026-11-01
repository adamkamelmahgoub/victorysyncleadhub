begin;

-- Reserve the caller's 24-hour text-back window before contacting MightyCall.
-- A claim remains in place after an uncertain provider error so retries cannot
-- send a second text. Agency staff can inspect the failed automation job.
create table if not exists public.client_missed_call_text_windows (
  client_account_id uuid not null references public.sub_accounts(id) on delete cascade,
  phone text not null check(phone ~ '^\+1[0-9]{10}$'),
  job_id uuid not null,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key(client_account_id,phone)
);
create index if not exists client_missed_call_text_windows_claimed_idx
  on public.client_missed_call_text_windows(claimed_at);
alter table public.client_missed_call_text_windows enable row level security;
revoke all on public.client_missed_call_text_windows from public,anon,authenticated;
grant select,insert,update on public.client_missed_call_text_windows to service_role;

create or replace function public.client_claim_missed_call_text(
  p_account uuid,p_phone text,p_job uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare claimed uuid;
begin
  if p_phone !~ '^\+1[0-9]{10}$' or not exists(
    select 1 from public.client_automation_jobs j where j.id=p_job
      and j.client_account_id=p_account and j.kind='missed_call_text' and j.status='processing') then
    return false;
  end if;
  -- Preserve the 24-hour limit for texts sent before this migration.
  if exists(select 1 from public.mightycall_sms_messages m
    where m.client_account_id=p_account and lower(m.direction)='outbound'
      and m.metadata->>'automation_kind'='missed_call_text'
      and m.created_at>now()-interval '24 hours'
      and right(regexp_replace(coalesce(m.to_number,''),'[^0-9]','','g'),10)=right(p_phone,10)) then
    return false;
  end if;
  insert into public.client_missed_call_text_windows(client_account_id,phone,job_id,claimed_at,sent_at)
  values(p_account,p_phone,p_job,now(),null)
  on conflict(client_account_id,phone) do update
    set job_id=excluded.job_id,claimed_at=excluded.claimed_at,sent_at=null
    where public.client_missed_call_text_windows.claimed_at<=now()-interval '24 hours'
  returning job_id into claimed;
  return coalesce(claimed=p_job,false);
end $$;
revoke all on function public.client_claim_missed_call_text(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.client_claim_missed_call_text(uuid,text,uuid) to service_role;

create or replace function public.client_mark_missed_call_text_sent(
  p_account uuid,p_phone text,p_job uuid)
returns void language sql security definer set search_path = '' as $$
  update public.client_missed_call_text_windows set sent_at=now()
  where client_account_id=p_account and phone=p_phone and job_id=p_job and sent_at is null;
$$;
revoke all on function public.client_mark_missed_call_text_sent(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.client_mark_missed_call_text_sent(uuid,text,uuid) to service_role;

commit;
notify pgrst, 'reload schema';
