begin;

create table if not exists public.account_templates (
  key text primary key,
  name text not null,
  package text not null unique,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.account_templates enable row level security;
drop policy if exists account_templates_agency_read on public.account_templates;
create policy account_templates_agency_read on public.account_templates for select to authenticated
  using (public.is_agency());

alter table public.pipelines add column if not exists template_key text;
alter table public.forms add column if not exists template_key text;
alter table public.sequences add column if not exists template_key text;
alter table public.automation_workflows add column if not exists template_key text;
alter table public.company_tasks add column if not exists template_key text;
alter table public.marketing_landing_pages add column if not exists template_key text;
alter table public.sequence_steps drop constraint if exists sequence_steps_channel_check;
alter table public.sequence_steps add constraint sequence_steps_channel_check
  check (channel in ('email','manual_email','call_task','linkedin_task','action_item','sms'));
create unique index if not exists pipelines_account_template_idx on public.pipelines(client_account_id,template_key) where template_key is not null;
create unique index if not exists forms_account_template_idx on public.forms(client_account_id,template_key) where template_key is not null;
create unique index if not exists sequences_account_template_idx on public.sequences(client_account_id,template_key) where template_key is not null;
create unique index if not exists workflows_account_template_idx on public.automation_workflows(client_account_id,template_key) where template_key is not null;
create unique index if not exists marketing_pages_account_template_idx on public.marketing_landing_pages(client_account_id,template_key) where template_key is not null;
create unique index if not exists tasks_account_template_idx on public.company_tasks(client_account_id,template_key) where template_key is not null;

insert into public.account_templates(key,name,package,payload)
select t.package,initcap(replace(t.package,'_',' '))||' account',t.package,
  jsonb_build_object(
    'pipeline',jsonb_build_object('key','client_pipeline','name','Client pipeline',
      'stages','[{"key":"new","name":"New","color":"#3b82f6"},{"key":"contacted","name":"Contacted","color":"#8b5cf6"},{"key":"quoted","name":"Quoted","color":"#f59e0b"},{"key":"booked","name":"Booked","color":"#06b6d4"},{"key":"won","name":"Won","color":"#22c55e"},{"key":"lost","name":"Lost","color":"#64748b"}]'::jsonb),
    'forms','[{"key":"lead_capture","name":"Lead capture","fields":[{"id":"first_name","label":"First name","fieldType":"text","required":true,"order":0,"placeholder":null,"options":[],"mappedLeadField":"firstName"},{"id":"email","label":"Email","fieldType":"email","required":false,"order":1,"placeholder":null,"options":[],"mappedLeadField":"email"},{"id":"phone","label":"Phone","fieldType":"tel","required":true,"order":2,"placeholder":null,"options":[],"mappedLeadField":"phone"},{"id":"service","label":"How can we help?","fieldType":"textarea","required":true,"order":3,"placeholder":null,"options":[],"mappedLeadField":null}]}]'::jsonb,
    'landing_pages','[{"key":"lead_capture_page","name":"Lead capture page","sections":[{"id":"hero","type":"hero","eyebrow":"[Service area]","heading":"[Business name] helps homeowners in [Service area]","body":"Replace this text with the services and details the client has approved.","buttonText":"Request a callback","buttonUrl":"#contact"},{"id":"services","type":"features","heading":"How we can help","items":["[Service one]","[Service two]","[Service three]"]},{"id":"contact","type":"form","heading":"Tell us what you need","body":"Share your number and a team member will follow up."}],"form_key":"lead_capture"}]'::jsonb,
    'sequences','[{"key":"speed_to_lead","name":"Speed to lead","steps":[{"step_number":1,"channel":"sms","subject":"","body":"Thanks for contacting [Business name]. How can we help? Reply STOP to opt out.","delay_days":0},{"step_number":2,"channel":"email","subject":"We received your request","body":"Thanks for contacting [Business name]. We will follow up shortly.","delay_days":0},{"step_number":3,"channel":"sms","subject":"","body":"Checking in about your request. Reply STOP to opt out.","delay_days":1},{"step_number":4,"channel":"email","subject":"Following up on your request","body":"Let us know if you still need help.","delay_days":3}]},{"key":"review_request","name":"Review request","steps":[{"step_number":1,"channel":"sms","subject":"","body":"Thank you for choosing [Business name]. If you would like to share your experience, use [Google review link]. Reply STOP to opt out.","delay_days":0},{"step_number":2,"channel":"sms","subject":"","body":"If you have a moment, we would appreciate your feedback: [Google review link]. Reply STOP to opt out.","delay_days":3}]}]'::jsonb,
    'workflows',t.workflows,
    'onboarding_tasks',
      '[{"key":"google_profile","title":"Request Google Business Profile manager access","role":"marketing","day":0},{"key":"meta_access","title":"Request Meta partner access","role":"ads","day":0},{"key":"google_ads","title":"Request Google Ads account link","role":"ads","day":0},{"key":"lsa_check","title":"Confirm LSA background check and access","role":"ads","day":0},{"key":"website_access","title":"Request website and domain access","role":"marketing","day":0},{"key":"brand_assets","title":"Collect approved logo and photos","role":"marketing","day":0},{"key":"phone_forwarding","title":"Confirm phone forwarding and business hours","role":"account_manager","day":0},{"key":"build_form","title":"Build and test lead capture form","role":"marketing","day":1},{"key":"build_page","title":"Build and review landing page","role":"marketing","day":2},{"key":"test_workflows","title":"Test follow-up and opt-out workflows","role":"account_manager","day":3},{"key":"launch_call","title":"Hold launch call with client owner","role":"account_manager","day":5}]'::jsonb
      || case when t.package='domination' then '[{"key":"agent_handoff","title":"Test five-minute agent handoff","role":"agent_lead","day":3}]'::jsonb
        when t.package in ('overflow','business_hours','coverage_247','appt_part_time','appt_full_time') then '[{"key":"call_script","title":"Approve call script and booking rules","role":"agent_lead","day":1},{"key":"routing_test","title":"Test live call routing and recording","role":"agent_lead","day":2}]'::jsonb
        else '[]'::jsonb end,
    'report_settings',jsonb_build_object('frequency',case when t.package='domination' then 'weekly' else 'monthly' end,'status','draft'),
    'page_permissions',jsonb_build_object('client_owner','["dashboard","leads","calls","pages","forms","reviews","reports","billing","settings"]'::jsonb,
      'client_staff','["dashboard","leads","calls"]'::jsonb)
  )
from public.client_package_templates t
on conflict (key) do update set name=excluded.name,package=excluded.package,payload=excluded.payload,updated_at=now();

create or replace function public.portal_apply_account_template(p_account uuid,p_template text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.sub_accounts%rowtype; tpl public.account_templates%rowtype;
  item jsonb; stage jsonb; step jsonb; item_key text; v_pipeline_id uuid; v_form_id uuid;
  v_sequence_id uuid; creator uuid; v_company_id uuid; page_slug text; task_count integer;
begin
  if not public.is_agency_admin() or not public.client_feature_enabled('client_accounts') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select * into a from public.sub_accounts where id=p_account for update;
  if a.id is null then raise exception 'Client account not found' using errcode='22023'; end if;
  select * into tpl from public.account_templates where key=coalesce(p_template,a.package,a.plan);
  if tpl.key is null then raise exception 'Account template not found' using errcode='22023'; end if;
  creator:=auth.uid();
  v_company_id:=a.company_id;
  if v_company_id is null then
    insert into public.companies(name,phone,website,email,contact_name,stage,source)
    values(a.name,coalesce(a.phone,''),coalesce(a.website,''),a.owner_email,a.owner_name,'client','client_portal')
    returning id into v_company_id;
    update public.sub_accounts set company_id=v_company_id where id=a.id;
  end if;

  item:=tpl.payload->'pipeline';item_key:=item->>'key';
  select id into v_pipeline_id from public.pipelines where client_account_id=a.id
    and (template_key=item_key or name=item->>'name') order by (template_key=item_key) desc limit 1;
  if v_pipeline_id is null then
    insert into public.pipelines(client_account_id,name,description,is_default,template_key)
    values(a.id,item->>'name','Package template pipeline',
      not exists(select 1 from public.pipelines where client_account_id=a.id),item_key)
    returning id into v_pipeline_id;
  else
    update public.pipelines set template_key=item_key where id=v_pipeline_id and template_key is null;
  end if;
  for stage in select value from jsonb_array_elements(item->'stages') loop
    if not exists(select 1 from public.pipeline_stages where pipeline_id=v_pipeline_id
      and (key=stage->>'key' or lower(name)=lower(stage->>'name'))) then
      insert into public.pipeline_stages(pipeline_id,client_account_id,name,color,position,key)
      values(v_pipeline_id,a.id,stage->>'name',stage->>'color',
        (select coalesce(max(position),0)+1 from public.pipeline_stages where pipeline_id=v_pipeline_id),stage->>'key');
    end if;
  end loop;

  for item in select value from jsonb_array_elements(tpl.payload->'forms') loop
    item_key:=item->>'key';
    select id into v_form_id from public.forms where client_account_id=a.id
      and (template_key=item_key or name=item->>'name') order by (template_key=item_key) desc limit 1;
    if v_form_id is null then
      insert into public.forms(organization_id,client_account_id,name,slug,status,fields,template_key)
      values(a.organization_id,a.id,item->>'name',left(a.slug,45)||'-'||item_key||'-'||left(a.id::text,8),
        'inactive',item->'fields',item_key) returning id into v_form_id;
    else
      update public.forms set template_key=item_key where id=v_form_id and template_key is null;
    end if;
  end loop;

  for item in select value from jsonb_array_elements(tpl.payload->'landing_pages') loop
    item_key:=item->>'key';
    select id into v_form_id from public.forms where client_account_id=a.id and template_key=item->>'form_key' limit 1;
    page_slug:=left(a.slug,42)||'-'||item_key||'-'||left(a.id::text,8);
    if not exists(select 1 from public.marketing_landing_pages where client_account_id=a.id
      and (template_key=item_key or title=item->>'name')) then
      insert into public.marketing_landing_pages(organization_id,client_account_id,title,slug,status,
        sections,theme,template_key)
      values(a.organization_id,a.id,item->>'name',page_slug,'draft',
        (select jsonb_agg(jsonb_build_object('id',s.value->>'id','type',s.value->>'type',
          'heading',coalesce(s.value->>'heading',''),'body',coalesce(s.value->>'body',''),
          'buttonText',coalesce(s.value->>'buttonText',''),'buttonUrl',coalesce(s.value->>'buttonUrl',''),
          'items',coalesce(s.value->'items','[]'::jsonb),
          'formId',case when s.value->>'type'='form' then coalesce(v_form_id::text,'') else '' end)
          order by s.ordinality) from jsonb_array_elements(item->'sections') with ordinality as s(value,ordinality)),
        jsonb_build_object('font','sans','foreground','#172033','accent','#285ce6','background','#ffffff'),item_key);
    else
      update public.marketing_landing_pages set template_key=item_key where client_account_id=a.id
        and title=item->>'name' and template_key is null;
    end if;
  end loop;

  for item in select value from jsonb_array_elements(tpl.payload->'sequences') loop
    item_key:=item->>'key';
    select id into v_sequence_id from public.sequences where client_account_id=a.id
      and (template_key=item_key or name=item->>'name') order by (template_key=item_key) desc limit 1;
    if v_sequence_id is null then
      insert into public.sequences(client_account_id,name,status,template_key)
      values(a.id,item->>'name','draft',item_key) returning id into v_sequence_id;
    else
      update public.sequences set template_key=item_key where id=v_sequence_id and template_key is null;
    end if;
    for step in select value from jsonb_array_elements(item->'steps') loop
      if not exists(select 1 from public.sequence_steps where sequence_id=v_sequence_id
        and step_number=(step->>'step_number')::integer) then
        insert into public.sequence_steps(sequence_id,client_account_id,step_number,subject,body,delay_days,channel)
        values(v_sequence_id,a.id,(step->>'step_number')::integer,coalesce(step->>'subject',''),
          step->>'body',(step->>'delay_days')::integer,step->>'channel');
      end if;
    end loop;
  end loop;

  for item in select value from jsonb_array_elements(tpl.payload->'workflows') loop
    item_key:=coalesce(item->>'key',lower(regexp_replace(item->>'name','[^a-zA-Z0-9]+','_','g')));
    if not exists(select 1 from public.automation_workflows where client_account_id=a.id
      and (template_key=item_key or (name=item->>'name' and trigger_type=item->>'trigger_type'))) then
      insert into public.automation_workflows(client_account_id,name,trigger_type,actions,is_active,template_key)
      values(a.id,item->>'name',item->>'trigger_type',coalesce(item->'actions','[]'::jsonb),true,item_key);
    else
      update public.automation_workflows set template_key=item_key where client_account_id=a.id
        and name=item->>'name' and trigger_type=item->>'trigger_type' and template_key is null;
    end if;
  end loop;

  for item in select value from jsonb_array_elements(tpl.payload->'onboarding_tasks') loop
    item_key:=item->>'key';
    if not exists(select 1 from public.company_tasks where client_account_id=a.id
      and (template_key=item_key or title=item->>'title')) then
      insert into public.company_tasks(company_id,client_account_id,title,kind,status,priority,due_at,assignee,created_by,template_key)
      values(v_company_id,a.id,item->>'title','task','pending','normal',
        coalesce(a.launch_date::timestamptz,now())+make_interval(days=>(item->>'day')::integer),
        item->>'role',creator,item_key);
    else
      update public.company_tasks set template_key=item_key where client_account_id=a.id
        and title=item->>'title' and template_key is null;
    end if;
  end loop;

  update public.sub_accounts set settings=(tpl.payload->'report_settings')||coalesce(settings,'{}'::jsonb)
    where id=a.id;
  update public.team_members set page_permissions=tpl.payload->'page_permissions'->role
    where client_account_id=a.id and role in ('client_owner','client_staff') and page_permissions is null;
  select count(*) into task_count from public.company_tasks where client_account_id=a.id and template_key is not null;
  return jsonb_build_object('accountId',a.id,'template',tpl.key,'pipelineId',v_pipeline_id,
    'forms',(select count(*) from public.forms where client_account_id=a.id and template_key is not null),
    'pages',(select count(*) from public.marketing_landing_pages where client_account_id=a.id and template_key is not null),
    'sequences',(select count(*) from public.sequences where client_account_id=a.id and template_key is not null),
    'workflows',(select count(*) from public.automation_workflows where client_account_id=a.id and template_key is not null),
    'tasks',task_count);
end $$;
revoke all on function public.portal_apply_account_template(uuid,text) from public,anon;
grant execute on function public.portal_apply_account_template(uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;

