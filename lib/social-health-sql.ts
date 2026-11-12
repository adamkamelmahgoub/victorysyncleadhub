export const markStaleUnipileAccountsSql=`update public.connected_accounts a
  set status='error',health='reconnect_needed',
    last_error='No new inbound messages for 48 hours while outbound messages continued. Reconnect this account.',updated_at=now()
  where a.provider='unipile' and a.status='active' and a.health is distinct from 'reconnect_needed'
    and extract(isodow from now() at time zone coalesce(a.timezone,'America/New_York')) between 1 and 5
    and coalesce(a.last_webhook_at,a.created_at)<now()-interval '48 hours'
    and not exists(select 1 from public.conversations c where c.connected_account_id=a.id
      and c.last_inbound_at>=now()-interval '48 hours')
    and exists(select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
      where c.connected_account_id=a.id and m.direction='outbound' and m.created_at>=now()-interval '48 hours')
  returning a.id,a.organization_id,a.label,a.owner_user_id`;
