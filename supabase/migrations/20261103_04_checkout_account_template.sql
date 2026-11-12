-- Permit signed Stripe checkout provisioning to apply the same account snapshot as agency creation.
begin;
create or replace function public.portal_apply_account_template(p_account uuid,p_template text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.sub_accounts%rowtype; tpl public.account_templates%rowtype;
  item jsonb; stage jsonb; step jsonb; item_key text; v_pipeline_id uuid; v_form_id uuid;
  v_sequence_id uuid; creator uuid; v_company_id uuid; page_slug text; task_count integer;
begin
  if auth.role() <> 'service_role' and (not public.is_agency_admin() or not public.client_feature_enabled('client_accounts')) or
    auth.role() = 'service_role' and not exists(select 1 from public.user_feature_access f
      where f.org_id='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid and f.user_id is null
        and f.feature_key='client_accounts' and f.enabled) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select * into a from public.sub_accounts where id=p_account for update;
  if a.id is null then raise exception 'Client account not found' using errcode='22023'; end if;
  if auth.role() = 'service_role' and a.organization_id <> 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select * into tpl from public.account_templates where key=coalesce(p_template,a.package,a.plan);
  if tpl.key is null then raise exception 'Account template not found' using errcode='22023'; end if;
  creator:=auth.uid();
  if creator is null then
    select coalesce(t.user_id,t.auth_user_id::uuid) into creator from public.team_members t
    where t.role in ('agency_admin','owner','admin') and t.is_active is distinct from false
      and (t.user_id is not null or t.auth_user_id is not null)
    order by t.created_at limit 1;
  end if;
  if creator is null then raise exception 'Agency task creator is missing' using errcode='22023'; end if;
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
grant execute on function public.portal_apply_account_template(uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
