import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const userId='20000000-0000-4000-8000-000000000088';
const part=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt=`${part({alg:'HS256',typ:'JWT'})}.${part({sub:userId,role:'authenticated',
  crm_role:'admin',aal:'aal2',exp:4102444800})}.test-signature`;

test('agency admin sees delivery setup without clipping or secret values',async({page},testInfo)=>{
  await page.addInitScript(({jwt,userId})=>{
    localStorage.setItem('sb-supabase-auth-token',JSON.stringify({access_token:jwt,
      refresh_token:'fake-refresh',token_type:'bearer',expires_in:3600,expires_at:4102444800,
      user:{id:userId,aud:'authenticated',role:'authenticated',email:'agency@example.test',
        app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}}));
  },{jwt,userId});
  await page.route('https://supabase.test/**',route=>route.fulfill({status:200,
    contentType:'application/json',body:'{}'}));
  await page.route('**/api/**',route=>{
    const url=new URL(route.request().url());
    const action=url.searchParams.get('action');
    const body=action==='accounts'?{accounts:[],selected:{accountId:null,viewAsClient:false}}:
      action==='provider_readiness'?{sandbox:true,stripe:false,mightycall:false,invites:false,
        reports:false,slack:false,portalUrl:false,publicPagesUrl:false,worker:true}:[];
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('/client-portal');
  await expect(page.getByRole('heading',{name:'Delivery setup'})).toBeVisible();
  await expect(page.getByText('Sandbox mode is on. Automatic external sends are paused.')).toBeVisible();
  await expect(page.getByText('Needs setup').first()).toBeVisible();
  await expect(page.getByText('Configured',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Open AI assistant'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:testInfo.outputPath('agency-delivery-setup.png'),fullPage:true});
});

test('agency admin can enable the portal from its disabled screen',async({page})=>{
  await page.addInitScript(({jwt,userId})=>{
    localStorage.setItem('sb-supabase-auth-token',JSON.stringify({access_token:jwt,
      refresh_token:'fake-refresh',token_type:'bearer',expires_in:3600,expires_at:4102444800,
      user:{id:userId,aud:'authenticated',role:'authenticated',email:'agency@example.test',
        app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}}));
  },{jwt,userId});
  await page.route('https://supabase.test/**',route=>route.fulfill({status:200,
    contentType:'application/json',body:'{}'}));
  let enabled=false;
  await page.route('**/api/**',async route=>{
    const request=route.request();const url=new URL(request.url());
    const action=url.searchParams.get('action');
    if(action==='accounts'&&!enabled)return route.fulfill({status:403,
      contentType:'application/json',body:JSON.stringify({error:'Client portal is disabled'})});
    if(request.method()==='POST'){
      const data=request.postDataJSON() as {action?:string;feature?:string;enabled?:boolean};
      if(data.action==='set_feature'&&data.feature==='client_portal')enabled=data.enabled===true;
      return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    }
    const body=action==='accounts'?{accounts:[],selected:{accountId:null,viewAsClient:false}}:
      action==='features'?[{feature_key:'client_portal',user_id:null,enabled}]:[];
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('/client-portal');
  await expect(page.getByText('Client portal unavailable')).toBeVisible();
  await page.getByRole('checkbox',{name:'Client Portal'}).click();
  await expect(page.getByRole('heading',{name:'Delivery setup'})).toBeVisible();
  expect(enabled).toBe(true);
});

test('agency accounts and failed automations fit desktop and mobile',async({page},testInfo)=>{
  await page.addInitScript(({jwt,userId})=>{
    localStorage.setItem('sb-supabase-auth-token',JSON.stringify({access_token:jwt,
      refresh_token:'fake-refresh',token_type:'bearer',expires_in:3600,expires_at:4102444800,
      user:{id:userId,aud:'authenticated',role:'authenticated',email:'agency@example.test',
        app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}}));
  },{jwt,userId});
  await page.route('https://supabase.test/**',route=>route.fulfill({status:200,
    contentType:'application/json',body:'{}'}));
  await page.route('**/api/**',route=>{
    const action=new URL(route.request().url()).searchParams.get('action');
    const data=action==='accounts'?{accounts:[{id:'10000000-0000-4000-8000-000000000001',name:'Demo Plumbing'}],
      selected:{accountId:null,viewAsClient:false}}:
      action==='agency_overview'?[{id:'10000000-0000-4000-8000-000000000001',name:'Demo Plumbing',
        package:'domination',launch_date:'2026-10-01',health_score:82,overdue_tasks:2,failed_payments:1,
        last_active_at:'2026-11-01T10:00:00Z',response_seconds:95,mrr_cents:250000,leads_month:42,
        goal_value:50,answered_minutes:240,answering_hours_limit:10,texts_sent:34,ai_tokens:1500,
        account_manager:'Agency Manager'}]:
      action==='failed_automations'?[{id:'20000000-0000-4000-8000-000000000001',
        account_name:'Demo Plumbing',kind:'lead_email',error:'Provider unavailable',attempts:3}]:
      action==='provider_readiness'?{sandbox:true,stripe:false,mightycall:false,invites:false,
        reports:false,slack:false,portalUrl:true,publicPagesUrl:true,worker:true}:[];
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('/client-portal');
  await expect(page.getByRole('heading',{name:'Accounts overview'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Failed automations'})).toBeVisible();
  await expect(page.getByRole('table').getByText('Demo Plumbing')).toBeVisible();
  await expect(page.getByRole('button',{name:'Retry'})).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const accessibility=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(accessibility.violations.filter(item=>['critical','serious'].includes(item.impact||''))
    .flatMap(item=>item.nodes.map(node=>`${item.id}: ${node.target.join(' ')}`))).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('agency-operations.png'),fullPage:true});
});
