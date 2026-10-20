begin;

create or replace view public.crm_social_leads with (security_invoker=true) as
select l.*,
  exists(select 1 from public.social_profiles p where p.entity_type='lead' and p.entity_id=l.id
    and p.platform='instagram' and p.review_status<>'rejected') has_instagram,
  exists(select 1 from public.social_profiles p where p.entity_type='lead' and p.entity_id=l.id
    and p.review_status<>'rejected') has_socials,
  exists(select 1 from public.conversations c join public.messages m on m.conversation_id=c.id
    where c.lead_id=l.id and m.direction='outbound' and m.created_at>=now()-interval '7 days') dmed_recently,
  exists(select 1 from public.conversations c join public.messages m on m.conversation_id=c.id
    where c.lead_id=l.id and m.direction='inbound') replied
from public.leads l;
grant select on public.crm_social_leads to authenticated;
create index if not exists social_messages_recent_idx on public.messages(conversation_id,created_at desc)
  where direction='outbound';
create index if not exists social_messages_replies_idx on public.messages(conversation_id)
  where direction='inbound';

commit;
notify pgrst, 'reload schema';
