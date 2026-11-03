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
        action==='review_summary'?{requestsSent:130,requestsClicked:45,reviewsReceived:125,averageRating:4.8,
          trend:[{month:'2026-10',rating:4.8,count:125}]}:
        action==='review_page'?{rows:url.searchParams.get('kind')==='reviews'?[{
          id:'70000000-0000-4000-8000-000000000001',reviewer:'Verified customer',rating:5,
          created_at:'2026-10-15T00:00:00Z'}]:[],nextCursor:null}:
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
        action==='page_edit_allowed'?true:
        action==='launchpad'?{accountName:'Demo Plumbing',steps:[
          {key:'phone',label:'Connect your phone number',done:false,path:'/client-portal/settings'},
          {key:'page',label:'Publish your first landing page',done:false,path:'/client-portal/pages'},
          {key:'workflow',label:'Activate your first workflow',done:false,path:'/automation'}]}:
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

test('launchpad shows only reachable actions to client staff',async({page})=>{
  const staffJwt=`${tokenPart({alg:'HS256',typ:'JWT'})}.${tokenPart({sub:userId,role:'authenticated',
    crm_role:'client_staff',crm_client_account_id:accountId,exp:4102444800})}.test-signature`;
  await page.addInitScript(value=>{
    const key='sb-supabase-auth-token',session=JSON.parse(localStorage.getItem(key)||'{}');
    localStorage.setItem(key,JSON.stringify({...session,access_token:value}));
  },staffJwt);
  await page.goto('/client-portal/launchpad');
  await expect(page.getByRole('heading',{name:'Set up Demo Plumbing'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Open'})).toHaveCount(0);
  await expect(page.getByText('Ask your account owner')).toHaveCount(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
});

test('account switcher is available in the top bar without clipping the portal',async({page})=>{
  await page.goto('/client-portal/dashboard');
  const switcher=page.locator('header').getByRole('combobox',{name:'Selected client account'});
  await expect(switcher).toBeVisible();
  await expect(switcher).toHaveValue(accountId);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
});

test('agency top-bar switcher searches assigned client accounts',async({page})=>{
  const agencyJwt=`${tokenPart({alg:'HS256',typ:'JWT'})}.${tokenPart({sub:userId,role:'authenticated',
    crm_role:'agency_admin',aal:'aal2',exp:4102444800})}.test-signature`;
  await page.addInitScript(value=>{
    const key='sb-supabase-auth-token',session=JSON.parse(localStorage.getItem(key)||'{}');
    localStorage.setItem(key,JSON.stringify({...session,access_token:value}));
  },agencyJwt);
  const accounts=Array.from({length:5},(_,index)=>({id:`10000000-0000-4000-8000-00000000000${index+1}`,
    name:index===4?'Westside HVAC':`Client ${index+1}`,health_score:80,leads_this_week:0,
    overdue_tasks:0,failed_payments:0}));
  let switched:string|null=null;
  await page.route('**/api/portal',route=>{
    if(route.request().method()!=='POST')return route.fallback();
    const body=route.request().postDataJSON() as {action?:string;accountId?:string};
    if(body.action!=='switch')return route.fallback();
    switched=body.accountId||null;
    return route.fulfill({status:200,contentType:'application/json',body:'{}'});
  });
  await page.route('**/api/portal?action=accounts',route=>route.fulfill({status:200,
    contentType:'application/json',body:JSON.stringify({accounts,selected:{accountId,viewAsClient:false}})}));
  await page.goto('/client-portal/dashboard');
  const header=page.locator('header');
  await header.getByRole('textbox',{name:'Search client accounts'}).fill('Westside');
  const switcher=header.getByRole('combobox',{name:'Selected client account'});
  await expect(switcher.getByRole('option')).toHaveCount(3);
  await expect(switcher.getByRole('option',{name:'Agency view'})).toBeAttached();
  await expect(switcher.getByRole('option',{name:'Westside HVAC'})).toBeAttached();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
  await switcher.selectOption(accounts[4].id);
  await expect.poll(()=>switched).toBe(accounts[4].id);
});

test('client page editing flag controls the full builder and quick editor',async({page})=>{
  await page.goto('/client-portal/pages');
  await expect(page.getByRole('button',{name:'Full builder'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Full builder'})).toHaveAttribute('href',
    '/landing-pages/50000000-0000-4000-8000-000000000001?from=client-portal');
  await page.route('**/api/portal?action=page_edit_allowed',route=>route.fulfill({status:200,
    contentType:'application/json',body:'false'}));
  await page.reload();
  await expect(page.getByRole('button',{name:'Full builder'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'New page'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'View'})).toBeVisible();
});

test('client owner can move a lead to Won, save a note, and record job value',async({page})=>{
  const writes:Array<Record<string,unknown>>=[];
  let stage:string|null=null;
  let note:string|null=null;
  const wonStage='40000000-0000-4000-8000-000000000005';
  await page.route('**/api/portal*',async route=>{
    const request=route.request();const url=new URL(request.url());
    const action=url.searchParams.get('action');
    if(request.method()==='POST'){
      const data=request.postDataJSON() as Record<string,unknown>;
      writes.push(data);
      if(data.action==='change_lead'){
        if('stageId'in data)stage=data.stageId as string|null;
        if('notes'in data)note=data.notes as string|null;
      }
      return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    }
    if(action==='snapshot'&&url.searchParams.get('section')==='leads'){
      const data={accountId,readOnly:false,data:{rows:[{...lead,pipeline_stage_id:stage,notes:note}],
        stages:[{id:'40000000-0000-4000-8000-000000000001',name:'New'},
          {id:wonStage,name:'Won'}]}};
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    }
    if(action==='lead_timeline')return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({lead:{...lead,pipeline_stage_id:stage,notes:note},events:[{
        event_type:'call',body:'Customer booked a repair',created_at:'2026-10-15T12:00:00Z',
        metadata:{recording_url:'https://example.test/recording.mp3'}}]})});
    return route.fallback();
  });
  await page.goto('/client-portal/leads');
  await page.getByRole('button',{name:'Pipeline board'}).click();
  await expect(page.getByText('Alex Customer')).toBeVisible();
  await page.getByRole('combobox',{name:'Stage for Alex Customer'}).selectOption(wonStage);
  await expect.poll(()=>stage).toBe(wonStage);
  await page.getByRole('textbox',{name:'Notes for Alex Customer'}).fill('Approved the quote');
  await page.getByRole('button',{name:'Save note'}).click();
  await expect.poll(()=>note).toBe('Approved the quote');
  await page.getByRole('button',{name:'Timeline'}).click();
  await expect(page.getByText('Customer booked a repair')).toBeVisible();
  await expect(page.locator('audio[controls]')).toHaveCount(1);
  await page.getByRole('spinbutton',{name:'Job value'}).fill('1250');
  await page.getByRole('button',{name:'Save job value'}).click();
  await expect.poll(()=>writes.some(x=>x.action==='set_job_value'&&x.value===1250)).toBe(true);
  expect(writes.filter(x=>x.action==='change_lead').map(x=>x.leadId)).toEqual([lead.id,lead.id]);
});

test('client lead list and board load older account leads',async({page})=>{
  const older={...lead,id:'30000000-0000-4000-8000-000000000002',first_name:'Jordan',
    last_name:'Older',created_at:'2026-10-14T12:00:00Z'};
  const cursor={createdAt:lead.created_at,id:lead.id};
  let requestedCursor='';
  await page.route('**/api/portal*',async route=>{
    const url=new URL(route.request().url());
    if(url.searchParams.get('action')==='snapshot'&&url.searchParams.get('section')==='leads')
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        accountId,readOnly:false,data:{rows:[lead],stages:[],nextCursor:cursor}})});
    if(url.searchParams.get('action')==='lead_page'){
      requestedCursor=url.searchParams.get('beforeId')||'';
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({rows:[older],stages:[],nextCursor:null})});
    }
    return route.fallback();
  });
  await page.goto('/client-portal/leads');
  await page.getByRole('button',{name:'Load older leads'}).click();
  expect(requestedCursor).toBe(lead.id);
  await expect(page.getByText('Jordan Older')).toBeVisible();
  await page.getByRole('button',{name:'Pipeline board'}).click();
  await expect(page.getByText('Jordan Older')).toBeVisible();
  await expect(page.getByText('2 leads shown')).toBeVisible();
});

test('client call log loads older calls in the selected range',async({page})=>{
  const first=Array.from({length:200},(_,index)=>({id:`80000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
    occurred_at:'2026-10-15T12:00:00Z',caller_number:'+15125550101',status:'answered',
    duration_seconds:120,outcome:'booked',summary:null,recording_url:null,agent_name:'Agent',booked:true}));
  const older={...first[0],id:'80000000-0000-4000-8000-000000000201',caller_number:'+15125550999',
    occurred_at:'2026-10-14T12:00:00Z'};
  let beforeId='';
  await page.route('**/api/portal*',async route=>{
    const url=new URL(route.request().url());
    if(url.searchParams.get('action')==='calls')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(first)});
    if(url.searchParams.get('action')==='call_page'){
      beforeId=url.searchParams.get('beforeId')||'';
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([older])});
    }
    return route.fallback();
  });
  await page.goto('/client-portal/calls');
  await page.getByRole('button',{name:'Load older calls'}).click();
  expect(beforeId).toBe(first[199].id);
  await expect(page.getByText('+15125550999')).toBeVisible();
  await expect(page.getByRole('button',{name:'Load older calls'})).toHaveCount(0);
});

test('clearing a call date shows a useful validation message',async({page})=>{
  await page.goto('/client-portal/calls');
  await page.getByLabel('Calls from').fill('');
  await expect(page.getByRole('alert')).toContainText('Choose a valid start and end date.');
  await expect(page.getByRole('heading',{name:'Demo Plumbing portal'})).toBeVisible();
});

test('review picker searches older Won leads beyond the first lead page',async({page})=>{
  const older={...lead,id:'30000000-0000-4000-8000-000000000099',first_name:'Jordan',
    last_name:'Older',phone:'+15125550999'};
  let search='';
  await page.route('**/api/portal*',async route=>{
    const url=new URL(route.request().url());
    if(url.searchParams.get('action')==='won_leads'){
      search=url.searchParams.get('query')||'';
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(search==='Jordan'?[older]:[])});
    }
    return route.fallback();
  });
  await page.goto('/client-portal/reviews');
  await page.getByRole('textbox',{name:'Search Won leads'}).fill('Jordan');
  await page.getByRole('combobox',{name:'Won lead'}).selectOption(older.id);
  expect(search).toBe('Jordan');
  await expect(page.getByRole('textbox',{name:'Customer name'})).toHaveValue('Jordan Older');
  await expect(page.getByRole('textbox',{name:'Customer phone'})).toHaveValue('+15125550999');
});

test('review summary shows totals beyond the visible review rows',async({page})=>{
  await page.goto('/client-portal/reviews');
  await expect(page.getByText('Reviews received')).toBeVisible();
  await expect(page.getByText('125',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('130',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('45',{exact:true}).first()).toBeVisible();
});

test('reviews and requests can load older rows independently',async({page})=>{
  const firstReviews=Array.from({length:100},(_,index)=>({id:`70000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
    reviewer:`Customer ${index+1}`,rating:5,created_at:'2026-10-15T00:00:00Z'}));
  const firstRequests=Array.from({length:100},(_,index)=>({id:`80000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
    contact_name:`Request ${index+1}`,status:'sent',sent_at:'2026-10-15T00:00:00Z'}));
  const reviewCursor={at:'2026-10-15T00:00:00Z',id:firstReviews[99].id};
  const requestCursor={at:'2026-10-15T00:00:00Z',id:firstRequests[99].id};
  await page.route('**/api/portal*',route=>{
    const url=new URL(route.request().url());
    if(url.searchParams.get('action')!=='review_page')return route.fallback();
    const reviews=url.searchParams.get('kind')==='reviews';
    const older=!!url.searchParams.get('beforeId');
    const rows=older?[reviews?{id:'70000000-0000-4000-8000-000000000101',reviewer:'Older reviewer',rating:4,
      created_at:'2026-10-14T00:00:00Z'}:{id:'80000000-0000-4000-8000-000000000101',contact_name:'Older request',
      status:'clicked',sent_at:'2026-10-14T00:00:00Z'}]:reviews?firstReviews:firstRequests;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({rows,
      nextCursor:older?null:reviews?reviewCursor:requestCursor})});
  });
  await page.goto('/client-portal/reviews');
  await page.getByRole('button',{name:'Load older reviews'}).click();
  await expect(page.getByText('Older reviewer')).toBeVisible();
  await page.getByRole('button',{name:'Load older requests'}).click();
  await expect(page.getByText('Older request')).toBeVisible();
  await expect(page.getByRole('button',{name:'Load older reviews'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Load older requests'})).toHaveCount(0);
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
  await page.getByRole('button',{name:'Hero'}).first().click();
  await page.getByRole('button',{name:'Publish'}).click();
  await expect.poll(()=>actions).toEqual(['save_page','save_page','publish_page']);
});

test('client page history restores an old version to draft',async({page})=>{
  let restored:Record<string,unknown>|null=null;
  await page.route('**/api/portal?*',async route=>{
    const url=new URL(route.request().url());
    if(url.searchParams.get('action')!=='page_versions')return route.fallback();
    expect(url.searchParams.get('pageId')).toBe('50000000-0000-4000-8000-000000000001');
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([
      {version:1,published_at:'2026-10-01T00:00:00Z',note:null}])});
  });
  await page.route('**/api/portal',async route=>{
    if(route.request().method()!=='POST'||route.request().postDataJSON()?.action!=='restore_page')
      return route.fallback();
    restored=route.request().postDataJSON() as Record<string,unknown>;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      sections:[{id:'old-hero',type:'hero',heading:'Earlier headline'}],
      theme:{background:'#ffffff',foreground:'#172033',accent:'#285ce6',font:'sans'}})});
  });
  await page.goto('/client-portal/pages');
  await page.getByRole('button',{name:'Edit'}).click();
  await page.getByText('Version history').click();
  await page.getByRole('button',{name:'Restore to draft'}).click();
  await expect(page.getByText('Earlier headline').first()).toBeVisible();
  expect(restored).toMatchObject({action:'restore_page',pageId:'50000000-0000-4000-8000-000000000001',version:1});
});

test('client page sections can be hidden, duplicated, deleted, undone and redone',async({page})=>{
  let saved:Record<string,unknown>|null=null;
  await page.route('**/api/portal',async route=>{
    if(route.request().method()!=='POST'||route.request().postDataJSON()?.action!=='save_page')
      return route.fallback();
    saved=route.request().postDataJSON() as Record<string,unknown>;
    return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({id:'50000000-0000-4000-8000-000000000001'})});
  });
  await page.goto('/client-portal/pages');
  await page.getByRole('button',{name:'Edit'}).click();
  await page.getByRole('button',{name:'Hero'}).click();
  await page.getByRole('button',{name:'Duplicate section'}).click();
  await expect(page.getByRole('button',{name:'Duplicate section'})).toHaveCount(2);
  await page.getByRole('button',{name:'Hide section'}).first().click();
  await expect(page.getByRole('button',{name:'Show section'})).toHaveCount(1);
  await page.getByRole('button',{name:'Undo'}).click();
  await expect(page.getByRole('button',{name:'Show section'})).toHaveCount(0);
  await page.getByRole('button',{name:'Redo'}).click();
  await expect(page.getByRole('button',{name:'Show section'})).toHaveCount(1);
  await page.getByRole('button',{name:'Delete section'}).last().click();
  await expect(page.getByRole('button',{name:'Delete section'})).toHaveCount(1);
  await page.getByRole('button',{name:'Hero'}).first().click();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('button',{name:'Delete section'})).toHaveCount(0);
  await page.getByRole('button',{name:'Undo'}).click();
  await expect(page.getByRole('button',{name:'Delete section'})).toHaveCount(1);
  await page.getByRole('button',{name:'Save draft'}).click();
  await expect.poll(()=>saved).not.toBeNull();
  expect(saved?.sections).toMatchObject([{hidden:true}]);
});

test('AI page suggestion is reviewed and applied as one undo step',async({page})=>{
  await page.route('**/api/portal',async route=>{
    if(route.request().method()!=='POST'||route.request().postDataJSON()?.action!=='ai_page')
      return route.fallback();
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      title:'Approved page',seoDescription:'Approved service',
      theme:{background:'#ffffff',foreground:'#172033',accent:'#285ce6',font:'sans'},
      sections:[{id:'ai-hero',type:'hero',heading:'Approved service'}]})});
  });
  await page.goto('/client-portal/pages');
  await page.getByRole('button',{name:'Edit'}).click();
  await page.getByRole('button',{name:'Hero'}).click();
  await page.getByLabel('Page request').fill('Make this a shorter service page');
  await page.getByRole('button',{name:'Suggest edits'}).click();
  await expect(page.getByText('Review AI suggestion')).toBeVisible();
  await expect(page.getByLabel('Page title')).toHaveValue('Demo service page');
  await page.getByRole('button',{name:'Apply to draft'}).click();
  await expect(page.getByLabel('Page title')).toHaveValue('Approved page');
  await page.getByRole('button',{name:'Undo'}).click();
  await expect(page.getByLabel('Page title')).toHaveValue('Demo service page');
});

test('client page edits autosave after two seconds and publish the latest draft',async({page})=>{
  const actions:string[]=[];
  await page.route('**/api/portal',async route=>{
    if(route.request().method()!=='POST')return route.fallback();
    const body=route.request().postDataJSON() as Record<string,unknown>;
    if(body.action!=='save_page'&&body.action!=='publish_page')return route.fallback();
    actions.push(String(body.action));
    if(body.action==='save_page')expect(body.sections).toMatchObject([{type:'hero'}]);
    return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({id:'50000000-0000-4000-8000-000000000001'})});
  });
  await page.goto('/client-portal/pages');
  await page.getByRole('button',{name:'Edit'}).click();
  await page.getByRole('button',{name:'Hero'}).click();
  await expect(page.getByRole('status')).toContainText('Unsaved changes');
  await expect.poll(()=>actions,{timeout:7000}).toEqual(['save_page']);
  await expect(page.getByRole('status')).toContainText('Saved');
  await page.getByRole('button',{name:'Publish'}).click();
  await expect.poll(()=>actions).toEqual(['save_page','save_page','publish_page']);
});
