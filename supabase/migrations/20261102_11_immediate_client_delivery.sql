begin;

create or replace function public.dispatch_immediate_client_delivery() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' and new.run_at <= now() + interval '5 seconds'
    and new.kind in ('lead_followup','lead_email','missed_call_text','owner_alert','stop_confirmation')
    and coalesce(current_setting('victorysync.client_delivery_dispatched',true),'') <> '1' then
    perform set_config('victorysync.client_delivery_dispatched','1',true);
    perform public.client_delivery_poll();
  end if;
  return new;
exception when others then
  raise warning 'Immediate client delivery dispatch failed for job %: %', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists dispatch_immediate_client_delivery on public.client_automation_jobs;
create trigger dispatch_immediate_client_delivery after insert on public.client_automation_jobs
for each row execute function public.dispatch_immediate_client_delivery();

revoke all on function public.dispatch_immediate_client_delivery() from public, anon, authenticated;

commit;
