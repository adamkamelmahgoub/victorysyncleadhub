begin;

insert into public.user_feature_access(org_id,user_id,feature_key,enabled)
values
  ('cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',null,'landing_page_builder',true),
  ('cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',null,'landing_page_ai',true)
on conflict (org_id,feature_key) where user_id is null
do update set enabled=true,updated_at=now();

commit;
