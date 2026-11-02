import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const accountId='10000000-0000-4000-8000-000000000001';
const userId='20000000-0000-4000-8000-000000000001';
const tokenPart=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt=`${tokenPart({alg:'HS256',typ:'JWT'})}.${tokenPart({sub:userId,role:'authenticated',
  crm_role:'client_owner',crm_client_account_id:accountId,exp:4102444800})}.test-signature`;
const lead={id:'30000000-0000-4000-8000-000000000001',first_name:'Alex',last_name:'Customer',
  company:'',phone:'+15125550101',email:'alex@example.test',pipeline_stage_id:null,
  notes:null,created_at:'2026-10-15T12:00:00Z'};
function snapshot(section:string|null){
  const data:Record<string,unknown>={
    dashboard:[],leads:{rows:[lead],stages:[{id:'40000000-0000-4000-8000-000000000001',name:'New'}]},
    calls:[],pages:[{id:'50000000-0000-4000-8000-000000000001',name:'Demo service page',slug:'demo-service',
      status:'published',seo_description:'Demo page',sections:[],theme:{background:'#ffffff',foreground:'#172033',accent:'#285ce6',font:'sans'},created_at:'2026-10-01T00:00:00Z'}],
    forms:[{id:'60000000-0000-4000-8000-000000000001',name:'Contact form',status:'active'}],
    reviews:{reviews:[{id:'70000000-0000-4000-8000-000000000001',reviewer:'Verified customer',rating:5,created_at:'2026-10-15T00:00:00Z'}],requests:[]},
    reports:[],billing:[],settings:{},
  };
  return {accountId,readOnly:false,data:data[section||'dashboard']??[]};
}

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
        action==='snapshot'?snapshot(url.searchParams.get('section')):
        action==='metrics'?{account:{id:accountId,name:'Demo Plumbing',goal_metric:'new_leads',goal_value:20},
          newLeads:8,bookedJobs:3,answeredCalls:21,missedCallsRecovered:2,reviewsReceived:4,
          averageRating:4.8,adSpendCents:30000,sourceBreakdown:{website:5,calls:3}}:
        action==='calls'?[{id:'80000000-0000-4000-8000-000000000001',occurred_at:'2026-10-15T12:00:00Z',
          caller_number:'+15125550101',status:'answered',duration_seconds:120,outcome:'booked',summary:'Booked a repair',recording_url:null,agent_name:'Agent',booked:true}]:
        action==='usage'?{minutesUsed:120,minutesIncluded:600,agentHours:2}:
        action==='reports'?[{id:'90000000-0000-4000-8000-000000000001',type:'monthly',
          period_start:'2026-09-01',period_end:'2026-09-30',status:'sent',work_done:'Updated campaign pages',
          whats_next:'Improve follow-up',pdf_path:'demo.pdf'}]:
        action==='page_stats'?[{id:'50000000-0000-4000-8000-000000000001',visits:100,leads:12}]:[];
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

for(const [section,visibleText] of [
  ['leads','Alex Customer'],['calls','Booked a repair'],['pages','Demo service page'],
  ['forms','Contact form'],['reviews','Verified customer'],['reports','Monthly report'],
  ['billing','Manage billing'],
] as const){
  test(`${section} page renders without clipping or serious accessibility violations`,async({page},testInfo)=>{
    await page.goto(`/client-portal/${section}`);
    await expect(page.getByRole('heading',{name:'Demo Plumbing portal'})).toBeVisible();
    await expect(page.getByText(visibleText,{exact:false}).first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    expect(result.violations.filter(item=>['critical','serious'].includes(item.impact||''))
      .flatMap(item=>item.nodes.map(node=>`${item.id}: ${node.target.join(' ')} ${node.html}`))).toEqual([]);
    await page.screenshot({path:testInfo.outputPath(`${section}.png`),fullPage:true});
  });
}

test('client owner can schedule a consented review request',async({page})=>{
  let submitted:Record<string,unknown>|null=null;
  await page.route('**/api/portal',async route=>{
    if(route.request().method()!=='POST')return route.fallback();
    const body=route.request().postDataJSON() as Record<string,unknown>;
    if(body.action!=='request_review')return route.fallback();
    submitted=body;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'review-request-1'})});
  });
  await page.goto('/client-portal/reviews');
  await page.getByLabel('Customer name').fill('Alex Customer');
  await page.getByLabel('Customer phone').fill('+15125550101');
  await page.getByRole('button',{name:'Request review'}).click();
  await expect(page.getByText('Review request scheduled.')).toBeVisible();
  expect(submitted).toMatchObject({action:'request_review',name:'Alex Customer',phone:'+15125550101'});
});

test('review request explains when the customer lacks consent',async({page})=>{
  await page.route('**/api/portal',async route=>{
    if(route.request().method()!=='POST'||route.request().postDataJSON()?.action!=='request_review')
      return route.fallback();
    return route.fulfill({status:400,contentType:'application/json',
      body:JSON.stringify({error:'An opted-in lead with this phone is required'})});
  });
  await page.goto('/client-portal/reviews');
  await page.getByLabel('Customer name').fill('Unknown Customer');
  await page.getByLabel('Customer phone').fill('+15125550999');
  await page.getByRole('button',{name:'Request review'}).click();
  await expect(page.getByRole('alert')).toContainText('An opted-in lead with this phone is required');
});

test('client page draft and publish use separate actions',async({page})=>{
  const actions:string[]=[];
  await page.route('**/api/portal',async route=>{
    if(route.request().method()!=='POST')return route.fallback();
    const body=route.request().postDataJSON() as Record<string,unknown>;
    if(body.action!=='save_page'&&body.action!=='publish_page')return route.fallback();
    actions.push(String(body.action));
    if(body.action==='save_page')expect(body.status).toBe('draft');
    if(body.action==='publish_page')expect(body.pageId).toBe('50000000-0000-4000-8000-000000000001');
    return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({id:'50000000-0000-4000-8000-000000000001'})});
  });
  await page.goto('/client-portal/pages');
  await page.getByRole('button',{name:'Edit'}).click();
  await page.getByRole('button',{name:'Save draft'}).click();
  await expect.poll(()=>actions).toEqual(['save_page']);
  await page.getByRole('button',{name:'Edit'}).click();
  await page.getByRole('button',{name:'Hero'}).click();
  await page.getByRole('button',{name:'Publish'}).click();
  await expect.poll(()=>actions).toEqual(['save_page','save_page','publish_page']);
});
