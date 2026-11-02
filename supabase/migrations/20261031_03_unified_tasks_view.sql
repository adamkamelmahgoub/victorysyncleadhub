begin;

-- Preserve both legacy tables and expose one read model. Existing writers keep their IDs.
alter table public.company_tasks add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table public.company_tasks add column if not exists opportunity_id uuid references public.leads(id) on delete set null;
alter table public.contact_tasks add column if not exists company_id uuid references public.companies(id) on delete set null;

create index if not exists company_tasks_lead_idx on public.company_tasks(lead_id,created_at desc);
create index if not exists contact_tasks_company_idx on public.contact_tasks(company_id,created_at desc);

-- Link only unambiguous exact company names. An ambiguous name remains unlinked for manual review.
update public.contact_tasks t set company_id=c.id
from public.leads l join public.companies c on lower(btrim(c.name))=lower(btrim(l.company))
where t.lead_id=l.id and t.company_id is null and nullif(btrim(l.company),'') is not null
  and (select count(*) from public.companies candidate
       where lower(btrim(candidate.name))=lower(btrim(l.company)) and candidate.deleted_at is null)=1
  and c.deleted_at is null;

create or replace view public.unified_tasks with (security_invoker=true) as
with combined as (
  select t.id,'company'::text as source,t.company_id,t.lead_id,t.opportunity_id,
    t.client_account_id,t.title,t.kind,t.status,t.priority,t.due_at,t.assignee,t.notes,
    t.created_at,t.updated_at
  from public.company_tasks t
  union all
  select t.id,'contact'::text as source,t.company_id,t.lead_id,null::uuid as opportunity_id,
    t.client_account_id,t.title,'task'::text as kind,
    case when t.is_completed then 'completed' else 'pending' end as status,
    case when t.priority='medium' then 'normal' else coalesce(t.priority,'normal') end as priority,
    t.due_date as due_at,null::text as assignee,t.description as notes,
    t.created_at,t.created_at as updated_at
  from public.contact_tasks t
), ranked as (
  select combined.*,row_number() over (
    partition by coalesce(lead_id::text,id::text),lower(btrim(title)),due_at
    order by case when source='company' then 0 else 1 end,created_at,id
  ) as duplicate_rank from combined
)
select id,source,company_id,lead_id,opportunity_id,client_account_id,title,kind,status,
  priority,due_at,assignee,notes,created_at,updated_at
from ranked where duplicate_rank=1;

grant select on public.unified_tasks to authenticated,service_role;
notify pgrst, 'reload schema';
commit;
