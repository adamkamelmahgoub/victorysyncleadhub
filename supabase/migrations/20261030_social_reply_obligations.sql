begin;

create table if not exists public.social_reply_obligations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  conversation_id uuid not null references public.conversations(id),
  rep_user_id uuid,
  inbound_message_id uuid not null unique references public.messages(id),
  due_at timestamptz not null,
  completed_at timestamptz,
  completed_message_id uuid references public.messages(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_reply_obligations_due on public.social_reply_obligations(organization_id,rep_user_id,due_at)
  where completed_at is null;
alter table public.social_reply_obligations enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='social_reply_obligations' and policyname='social_reply_obligations_owner') then
    create policy social_reply_obligations_owner on public.social_reply_obligations for select to authenticated
      using(public.has_social_perm(organization_id,'reports_view') and public.wf_role()='admin');
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='social_reply_obligations' and policyname='social_reply_obligations_rep') then
    create policy social_reply_obligations_rep on public.social_reply_obligations for select to authenticated
      using(rep_user_id=auth.uid() and public.has_social_perm(organization_id,'inbox_view'));
  end if;
end $$;
grant select on public.social_reply_obligations to authenticated;

create or replace function public.social_reply_due(p_inbound_at timestamptz,p_timezone text default 'America/New_York') returns timestamptz
language plpgsql stable set search_path='' as $$
declare v_local timestamp;v_day integer;v_remaining interval:=interval '2 hours';v_end timestamp;
begin
  v_local:=p_inbound_at at time zone p_timezone;
  for i in 1..8 loop
    v_day:=extract(isodow from v_local);
    if v_day between 1 and 5 then
      if v_local::time<time '09:00' then v_local:=date_trunc('day',v_local)+interval '9 hours'; end if;
      v_end:=date_trunc('day',v_local)+interval '17 hours';
      if v_local<v_end then
        if v_local+v_remaining<=v_end then return (v_local+v_remaining) at time zone p_timezone; end if;
        v_remaining:=v_remaining-(v_end-v_local);
      end if;
    end if;
    v_local:=date_trunc('day',v_local)+interval '1 day 9 hours';
  end loop;
  return p_inbound_at+interval '2 hours';
end $$;

create or replace function public.social_reply_obligation_fact() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_thread public.conversations%rowtype;v_timezone text;
begin
  select * into v_thread from public.conversations where id=new.conversation_id;
  if v_thread.id is null or v_thread.match_status='ignored' then return new; end if;
  if new.direction='inbound' then
    select timezone into v_timezone from public.connected_accounts where id=v_thread.connected_account_id;
    insert into public.social_reply_obligations(organization_id,conversation_id,rep_user_id,inbound_message_id,due_at)
      values(new.organization_id,new.conversation_id,v_thread.assigned_to,new.id,
        public.social_reply_due(new.created_at,coalesce(v_timezone,'America/New_York')))
      on conflict(inbound_message_id) do nothing;
  elsif new.direction='outbound' then
    update public.social_reply_obligations set completed_at=new.created_at,completed_message_id=new.id,updated_at=now()
      where conversation_id=new.conversation_id and completed_at is null
        and exists(select 1 from public.messages m where m.id=inbound_message_id and m.created_at<=new.created_at);
  end if;
  return new;
end $$;
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='social_reply_obligation_fact') then
    create trigger social_reply_obligation_fact after insert on public.messages
      for each row execute function public.social_reply_obligation_fact();
  end if;
end $$;

commit;
