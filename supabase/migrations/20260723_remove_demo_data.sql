-- Remove only records shipped by earlier VictorySync demo/seed code.
-- This intentionally does not remove pipeline stages, dispositions, or user-created records.

do $$
begin
  if to_regclass('public.email_templates') is not null then
    delete from public.email_templates
    where is_default = true
      and name in (
        'Welcome Email', 'Follow-up After Demo', 'Cold Outreach', 'Review Request',
        'Appointment Reminder', 'Deal Won Confirmation', 'Re-engagement'
      );
  end if;

  if to_regclass('public.prospects') is not null then
    delete from public.prospects
    where email in (
      'j.martinez@techwave.io', 'alex.t@growthlab.com', 'rchen@scalepeak.com',
      'morgan@nexusgrowth.com', 'c.wilson@launchify.co', 'tbrown@marketedge.io',
      's.lee@revampcrm.com', 'jpatel@brightloop.ai'
    );
  end if;

  if to_regclass('public.leads') is not null then
    delete from public.leads
    where email in ('jane@acme.com', 'john@startup.io', 'jane@example.com', 'test@example.com')
      and (
        source is null
        or lower(source) in ('sample', 'demo', 'test')
        or company in ('Acme Corp', 'Startup IO')
      );
  end if;
end $$;
