import {test,expect} from '@playwright/test';

const userId='20000000-0000-4000-8000-000000000088';
const accountId='10000000-0000-4000-8000-000000000001';
const part=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt=`${part({alg:'HS256',typ:'JWT'})}.${part({sub:userId,role:'authenticated',
  crm_role:'agency_staff',aal:'aal2',exp:4102444800})}.test-signature`;

test('assigned agency staff records monthly ad spend for the selected client',async({page})=>{
  await page.addInitScript(({jwt,userId})=>{
    localStorage.setItem('sb-supabase-auth-token',JSON.stringify({access_token:jwt,
      refresh_token:'fake-refresh',token_type:'bearer',expires_in:3600,expires_at:4102444800,
      user:{id:userId,aud:'authenticated',role:'authenticated',email:'staff@example.test',
        app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}}));
  },{jwt,userId});
  const writes:Array<Record<string,unknown>>=[];
  await page.route('https://supabase.test/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.route('**/api/**',route=>{
    const request=route.request();const url=new URL(request.url());
    if(url.pathname==='/api/portal'&&request.method()==='POST'){
      writes.push(request.postDataJSON() as Record<string,unknown>);
      return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    }
    const action=url.searchParams.get('action');
    const data=action==='accounts'?{accounts:[{id:accountId,name:'Demo Plumbing'}],selected:{accountId,viewAsClient:false}}:
      action==='branding'?{name:'Demo Plumbing',logoUrl:null,brand:null}:
      action==='ad_spend'?[]:
      action==='metrics'?{account:{id:accountId,name:'Demo Plumbing',goal_metric:'new_leads',goal_value:20},
        newLeads:2,bookedJobs:0,answeredCalls:0,missedCallsRecovered:0,reviewsReceived:0,
        averageRating:0,adSpendCents:0,sourceBreakdown:{website:2}}:[];
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('/client-portal/dashboard');
  await expect(page.getByRole('heading',{name:'Monthly ad spend'})).toBeVisible();
  await page.getByRole('combobox',{name:'Ad platform'}).selectOption('meta_ads');
  await page.getByRole('textbox',{name:'Spend month'}).fill('2026-11');
  await page.getByRole('spinbutton',{name:'Spend in dollars'}).fill('125.50');
  await page.getByRole('button',{name:'Save spend'}).click();
  await expect.poll(()=>writes.find(item=>item.action==='set_ad_spend')).toEqual({
    action:'set_ad_spend',platform:'meta_ads',month:'2026-11-01',amountCents:12550});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
});
