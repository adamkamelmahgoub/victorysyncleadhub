begin;

-- Social events enter the existing native workflow queue only when linked to a lead.
create or replace function public.social_workflow_message_trigger() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_lead uuid; v_channel text;
begin
  select c.lead_id,c.channel into v_lead,v_channel from public.conversations c
    where c.id=new.conversation_id and c.organization_id=new.organization_id;
  if v_lead is null then return new; end if;
  if new.direction='inbound' then
    perform public.outreach_workflow_start('social_reply_received',v_lead::text,new.id::text,
      jsonb_build_object('messageId',new.id,'conversationId',new.conversation_id,'channel',v_channel,'body',new.body));
  elsif new.direction='outbound' then
    perform public.outreach_workflow_start('social_dm_sent',v_lead::text,new.id::text,
      jsonb_build_object('messageId',new.id,'conversationId',new.conversation_id,'channel',v_channel));
  end if;
  return new;
end $$;
create trigger social_native_workflow_message after insert on public.messages
for each row execute function public.social_workflow_message_trigger();

create or replace function public.social_workflow_intent_trigger() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.lead_id is not null and new.intent is distinct from old.intent then
    perform public.outreach_workflow_start('social_intent_changed',new.lead_id::text,
      new.id::text||':'||new.intent||':'||extract(epoch from now())::text,
      jsonb_build_object('conversationId',new.id,'channel',new.channel,'intent',new.intent,'previous',old.intent));
  end if;
  return new;
end $$;
create trigger social_native_workflow_intent after update of intent on public.conversations
for each row execute function public.social_workflow_intent_trigger();

commit;
