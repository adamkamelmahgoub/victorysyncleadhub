export const aiPageLimitsSql=`select
  (select count(*)::integer from public.ai_requests where user_id=$1 and created_at>now()-interval '1 hour') requests,
  (select coalesce(sum(r.cost_cents),0)::float from public.ai_requests r
    join public.sub_accounts a on a.id=r.client_account_id
    where r.created_at>=date_trunc('month',now()) and a.organization_id=$2) spent,
  nullif(o.settings->>'ai_monthly_budget_cents','')::float budget
  from public.organizations o where o.id=$2`;

export function assertAiPageLimits(limits:{requests:number;spent:number;budget:number|null}|undefined){
  if(Number(limits?.requests||0)>=30)throw Error('AI request limit reached. Try again in an hour');
  if(limits?.budget!=null&&Number(limits.spent)>=Number(limits.budget))
    throw Error('Monthly AI budget reached');
}
