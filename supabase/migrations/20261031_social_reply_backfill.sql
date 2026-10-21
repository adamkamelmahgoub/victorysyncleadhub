begin;

with latest_inbound as (
  select distinct on (c.id) c.organization_id,c.id conversation_id,c.assigned_to rep_user_id,
    c.connected_account_id,m.id inbound_message_id,m.created_at inbound_at
  from public.conversations c join public.messages m on m.conversation_id=c.id and m.direction='inbound'
  where c.match_status<>'ignored' and c.status<>'closed'
    and m.created_at>=now()-interval '90 days'
  order by c.id,m.created_at desc,m.id desc
)
insert into public.social_reply_obligations(organization_id,conversation_id,rep_user_id,inbound_message_id,due_at)
select i.organization_id,i.conversation_id,i.rep_user_id,i.inbound_message_id,
  public.social_reply_due(i.inbound_at,coalesce(a.timezone,'America/New_York'))
from latest_inbound i left join public.connected_accounts a on a.id=i.connected_account_id
where not exists(select 1 from public.messages sent where sent.conversation_id=i.conversation_id
  and sent.direction='outbound' and sent.created_at>=i.inbound_at)
on conflict(inbound_message_id) do nothing;

commit;
