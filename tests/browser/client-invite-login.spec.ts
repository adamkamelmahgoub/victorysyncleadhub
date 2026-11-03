import {test,expect} from '@playwright/test';

const accountId='10000000-0000-4000-8000-000000000001';
const userId='20000000-0000-4000-8000-000000000001';
const tokenPart=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt=`${tokenPart({alg:'HS256',typ:'JWT'})}.${tokenPart({sub:userId,role:'authenticated',
  crm_role:'client_owner',crm_client_account_id:accountId,exp:4102444800})}.test-signature`;

test.beforeEach(async({page})=>{
  await page.route('https://supabase.test/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.route('**/api/**',route=>{
    const url=new URL(route.request().url());
    const data=url.pathname==='/api/portal'&&url.searchParams.get('action')==='accounts'
      ?{accounts:[{id:accountId,name:'Demo Plumbing',health_score:80,leads_this_week:0,
        overdue_tasks:0,failed_payments:0}],selected:{accountId,viewAsClient:false}}
      :url.pathname==='/api/portal'&&url.searchParams.get('action')==='branding'
        ?{name:'Demo Plumbing',logoUrl:null,brand:null}
      :url.pathname==='/api/portal'&&url.searchParams.get('action')==='metrics'
        ?{account:{id:accountId,name:'Demo Plumbing',goal_metric:'new_leads',goal_value:20},
          newLeads:0,bookedJobs:0,answeredCalls:0,missedCallsRecovered:0,reviewsReceived:0,
          averageRating:0,adSpendCents:0,sourceBreakdown:{}}
      :url.pathname==='/api/portal'&&url.searchParams.get('action')==='snapshot'
        ?{accountId,readOnly:false,data:[]}:{};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
});

test('invite code keeps its exact case when edited',async({page})=>{
  await page.goto('/login?invite=AbCd123&email=owner%40example.test');
  const code=page.getByRole('textbox',{name:'Invite code'});
  await expect(code).toHaveValue('AbCd123');
  await code.fill('aBcD456');
  await expect(code).toHaveValue('aBcD456');
});

test('client sign in on the invite URL lands in the client portal',async({page})=>{
  await page.addInitScript(({jwt,userId})=>{
    localStorage.setItem('sb-supabase-auth-token',JSON.stringify({access_token:jwt,refresh_token:'fake-refresh',
      token_type:'bearer',expires_in:3600,expires_at:4102444800,
      user:{id:userId,aud:'authenticated',role:'authenticated',email:'owner@example.test',
        app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}}));
  },{jwt,userId});
  await page.goto('/login?invite=AbCd123');
  await expect(page).toHaveURL(/\/client-portal\/dashboard$/);
  await expect(page.getByRole('heading',{name:'Demo Plumbing portal'})).toBeVisible();
});
