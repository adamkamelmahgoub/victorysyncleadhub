import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const accountId='10000000-0000-4000-8000-000000000001';
const userId='20000000-0000-4000-8000-000000000001';
const tokenPart=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt=`${tokenPart({alg:'HS256',typ:'JWT'})}.${tokenPart({sub:userId,role:'authenticated',
  crm_role:'client_owner',crm_client_account_id:accountId,exp:4102444800})}.test-signature`;

test.beforeEach(async({page})=>{
  await page.addInitScript(({jwt,userId})=>{
    localStorage.setItem('sb-supabase-auth-token',JSON.stringify({access_token:jwt,refresh_token:'fake-refresh',
      token_type:'bearer',expires_in:3600,expires_at:4102444800,
      user:{id:userId,aud:'authenticated',role:'authenticated',email:'owner@example.test',
        app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}}));
  },{jwt,userId});
  await page.route('https://supabase.test/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/auth/sync-session')return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    if(url.pathname==='/api/portal'){
      const action=url.searchParams.get('action');
      const data=action==='accounts'?{accounts:[{id:accountId,name:'Demo Plumbing',health_score:82,
          leads_this_week:8,overdue_tasks:0,failed_payments:0}],selected:{accountId,viewAsClient:false}}:
        action==='branding'?{name:'Demo Plumbing',logoUrl:null,brand:{primary:'#2563eb',text:'#172033',background:'#ffffff'}}:
        action==='snapshot'?{accountId,readOnly:false,data:[]}:
        action==='metrics'?{account:{id:accountId,name:'Demo Plumbing',goal_metric:'new_leads',goal_value:20},
          newLeads:8,bookedJobs:3,answeredCalls:21,missedCallsRecovered:2,reviewsReceived:4,
          averageRating:4.8,adSpendCents:30000,sourceBreakdown:{website:5,calls:3}}:[];
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    }
    return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
});

test('client dashboard fits the viewport and has no serious accessibility violations',async({page},testInfo)=>{
  await page.goto('/client-portal/dashboard');
  await expect(page.getByRole('heading',{name:'Demo Plumbing portal'})).toBeVisible();
  await expect(page.getByText('New Leads',{exact:true})).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(result.violations.filter(item=>['critical','serious'].includes(item.impact||''))
    .flatMap(item=>item.nodes.map(node=>`${item.id}: ${node.target.join(' ')} ${node.html}`))).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('client-dashboard.png'),fullPage:true});
});
