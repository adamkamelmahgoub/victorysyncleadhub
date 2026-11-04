begin;

-- Agency prospect pipelines retain their meeting stage. Client templates define
-- their own six stages, with Booked representing a booked job.
create or replace function public.seed_meeting_booked_stage() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.client_account_id is null then
    insert into public.pipeline_stages(pipeline_id,key,name,color,position)
    values(new.id,'meeting_booked','Meeting Booked','#16a34a',1)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

commit;
