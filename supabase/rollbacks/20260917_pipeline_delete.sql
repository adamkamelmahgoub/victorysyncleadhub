begin;
drop trigger if exists preserve_pipeline_contacts on public.pipelines;
drop function if exists public.preserve_pipeline_contacts();
commit;
