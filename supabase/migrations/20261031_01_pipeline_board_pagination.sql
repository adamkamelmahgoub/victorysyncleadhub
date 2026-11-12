begin;

create index if not exists leads_pipeline_stage_created_idx
  on public.leads(pipeline_stage_id,created_at desc,id desc);
create index if not exists leads_account_stage_created_idx
  on public.leads(client_account_id,pipeline_stage_id,created_at desc,id desc);

-- Rollback: drop the two indexes after checking query plans.
commit;
