begin;
alter table public.conversations add column if not exists suggested_lead_id uuid references public.leads(id);
create index if not exists conversations_suggested_lead_idx on public.conversations(organization_id,suggested_lead_id)
  where suggested_lead_id is not null;
commit;
