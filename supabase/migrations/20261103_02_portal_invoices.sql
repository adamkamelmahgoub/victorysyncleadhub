begin;

create index if not exists portal_invoices_account_issued_idx
  on public.invoices(client_account_id,issued_at desc,id desc);

create or replace function public.portal_invoices(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('billing') then
    raise exception 'Invoices unavailable' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.issued_at desc,i.id desc),'[]'::jsonb)
    into result
  from (select id,invoice_number,status,currency,total,amount_due,amount_paid,
    issued_at,due_at,paid_at,stripe_hosted_invoice_url,stripe_invoice_pdf
    from public.invoices where client_account_id=p_account) i;
  return result;
end $$;
revoke all on function public.portal_invoices(uuid) from public,anon;
grant execute on function public.portal_invoices(uuid) to authenticated;

commit;
