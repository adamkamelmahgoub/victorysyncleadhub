import {test,expect} from '@playwright/test';

const accountId='10000000-0000-4000-8000-000000000001';
const userId='20000000-0000-4000-8000-000000000001';
const pageId='50000000-0000-4000-8000-000000000001';
const tokenPart=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt=`${tokenPart({alg:'HS256',typ:'JWT'})}.${tokenPart({sub:userId,role:'authenticated',
  crm_role:'admin',crm_client_account_id:accountId,exp:4102444800})}.test-signature`;
const initialPage={id:pageId,name:'Demo service page',slug:'demo-service',status:'draft',
  sections:[{id:'hero-1',type:'hero',heading:'Original heading',body:'Service details'}],
  theme:{primary:'#245eea',background:'#ffffff',text:'#17243d'},seo_title:null,seo_description:null,
  social_image_url:null,form_id:null,publicUrl:'https://pages.victorysync.com/demo-service',version:0,
  tracking:{},traffic_split:50};

test.beforeEach(async({page})=>{
  await page.addInitScript(({jwt,userId})=>{
    localStorage.setItem('sb-supabase-auth-token',JSON.stringify({access_token:jwt,refresh_token:'fake-refresh',
      token_type:'bearer',expires_in:3600,expires_at:4102444800,
      user:{id:userId,aud:'authenticated',role:'authenticated',email:'admin@example.test',
        app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}}));
  },{jwt,userId});
  await page.route('https://supabase.test/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/auth/sync-session')return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    if(path==='/api/portal'){
      const action=new URL(route.request().url()).searchParams.get('action');
      const data=action==='accounts'?{accounts:[{id:accountId,name:'Demo Plumbing'}],
        selected:{accountId,viewAsClient:false}}:action==='branding'?{name:'Demo Plumbing',
        logoUrl:null,brand:{primary:'#2563eb',text:'#172033',background:'#ffffff'}}:[];
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    }
    if(path==='/api/forms')return route.fulfill({status:200,contentType:'application/json',body:'[]'});
    if(path===`/api/landing-pages/${pageId}/versions`)return route.fulfill({status:200,contentType:'application/json',body:'{"versions":[]}'});
    if(path===`/api/landing-pages/${pageId}/variants`)return route.fulfill({status:200,contentType:'application/json',body:'{"variants":[]}'});
    if(path===`/api/landing-pages/${pageId}/domain`)return route.fulfill({status:200,contentType:'application/json',body:'{"domain":null,"status":null}'});
    if(path===`/api/landing-pages/${pageId}`&&route.request().method()==='GET')return route.fulfill({status:200,
      contentType:'application/json',body:JSON.stringify(initialPage)});
    return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
});

test('page settings connects and verifies a client domain',async({page},testInfo)=>{
  let domain:string|null=null,verified=false;
  await page.route(`**/api/landing-pages/${pageId}/domain**`,route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/verify')){verified=true;return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({domain,status:{verified:true,verification:[]}})});}
    if(route.request().method()==='POST'){
      domain=(route.request().postDataJSON() as {domain:string}).domain;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({domain,
        status:{verified:false,verification:[{type:'TXT',domain:'_vercel.example.com',value:'test-challenge'}]}})});
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({domain,
      status:domain?{verified,verification:verified?[]:[{type:'TXT',domain:'_vercel.example.com',value:'test-challenge'}]}:null})});
  });
  await page.goto(`/landing-pages/${pageId}`);
  await page.getByRole('button',{name:'Page settings'}).click();
  await page.getByRole('textbox',{name:'Client domain'}).fill('offers.example.com');
  await page.getByRole('button',{name:'Connect domain'}).click();
  await expect(page.getByText('Waiting for domain verification')).toBeVisible();
  await expect(page.getByText(/test-challenge/)).toBeVisible();
  await page.getByRole('button',{name:'Check verification'}).click();
  await expect(page.getByText('Ownership verified; check DNS and HTTPS')).toBeVisible();
  expect(domain).toBe('offers.example.com');
  await page.screenshot({path:testInfo.outputPath('landing-domain.png'),fullPage:true});
});

test('draft iframe renders its hero without horizontal clipping',async({page})=>{
  await page.goto(`/landing-pages/${pageId}`);
  const preview=page.frameLocator('iframe[title="Draft landing page preview"]');
  await expect(preview.getByRole('heading',{name:'Original heading'})).toBeVisible();
  const dimensions=await preview.locator('html').evaluate(element=>({
    scrollWidth:element.scrollWidth,clientWidth:element.clientWidth}));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth+1);
});

test('blocks can be reordered, hidden, duplicated, and removed',async({page})=>{
  await page.goto(`/landing-pages/${pageId}`);
  await page.getByRole('button',{name:'Add section'}).click();
  await page.getByRole('button',{name:'Services grid',exact:true}).click();
  await page.getByRole('button',{name:'Add block'}).click();
  await page.getByPlaceholder('Title').first().fill('Drain cleaning');
  await expect(page.getByRole('button',{name:'Drain cleaning'})).toBeVisible();
  await page.getByRole('button',{name:'Drain cleaning'}).click();
  await expect(page.locator('[id^="block-"]')).toHaveCount(1);
  await page.getByRole('button',{name:'Add block'}).click();
  await page.getByPlaceholder('Title').nth(1).fill('Water heaters');
  await page.getByRole('button',{name:'Move block up'}).nth(1).click();
  await expect(page.getByPlaceholder('Title').first()).toHaveValue('Water heaters');
  await page.getByRole('button',{name:'Hide block'}).first().click();
  await expect(page.frameLocator('iframe[title="Draft landing page preview"]')
    .getByText('Water heaters')).toHaveCount(0);
  await page.getByRole('button',{name:'Duplicate block'}).nth(1).click();
  await expect(page.getByPlaceholder('Title')).toHaveCount(3);
  await page.getByRole('button',{name:'Remove block'}).last().click();
  await expect(page.getByPlaceholder('Title')).toHaveCount(2);
});

test('section copies get unique block IDs and Delete removes the selected block',async({page})=>{
  let savedSections:Array<{id:string;type:string;blocks?:Array<{id:string;heading?:string}>}>|null=null;
  await page.route(`**/api/landing-pages/${pageId}`,route=>{
    if(route.request().method()!=='PATCH')return route.fallback();
    const body=route.request().postDataJSON() as {sections:typeof savedSections};
    savedSections=body.sections;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...initialPage,...body})});
  });
  await page.goto(`/landing-pages/${pageId}`);
  await page.getByRole('button',{name:'Add section'}).click();
  await page.getByRole('button',{name:'Services grid',exact:true}).click();
  await page.getByRole('button',{name:'Add block'}).click();
  await page.getByPlaceholder('Title').fill('Drain cleaning');
  await page.getByRole('button',{name:/Services gridOur services/}).locator('..')
    .getByRole('button',{name:'Duplicate'}).click();
  await expect(page.getByRole('button',{name:'Drain cleaning'})).toHaveCount(2);
  await expect.poll(()=>savedSections?.filter(section=>section.type==='services').length).toBe(2);
  const copies=savedSections!.filter(section=>section.type==='services');
  expect(copies[0].blocks?.[0].id).not.toBe(copies[1].blocks?.[0].id);
  await page.getByRole('button',{name:'Drain cleaning'}).first().click();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('button',{name:'Drain cleaning'})).toHaveCount(1);
  await expect(page.getByRole('button',{name:/Services gridOur services/})).toHaveCount(2);
});

test('editor changes sections as one draft and publishes the saved state',async({page},testInfo)=>{
  let savedSections:Array<{id:string;type:string;heading?:string}>|null=null;
  let published=0;
  await page.route('**/api/landing-pages/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path===`/api/landing-pages/${pageId}`&&route.request().method()==='PATCH'){
      const body=route.request().postDataJSON() as {sections:Array<{id:string;type:string;heading?:string}>};
      savedSections=body.sections;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...initialPage,...body})});
    }
    if(path===`/api/landing-pages/${pageId}/publish`){
      published++;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...initialPage,
        sections:savedSections,status:'published',version:1})});
    }
    return route.fallback();
  });
  await page.goto(`/landing-pages/${pageId}`);
  await expect(page.getByRole('heading',{name:'Demo service page'})).toBeVisible();
  await page.getByRole('button',{name:'Add section'}).click();
  await page.getByRole('button',{name:'Services grid',exact:true}).click();
  await page.getByRole('textbox',{name:'Heading'}).fill('Plumbing services');
  await page.getByRole('button',{name:'Undo'}).click();
  await expect(page.getByRole('textbox',{name:'Heading'})).not.toHaveValue('Plumbing services');
  await page.getByRole('button',{name:'Redo'}).click();
  await expect(page.getByRole('textbox',{name:'Heading'})).toHaveValue('Plumbing services');
  await page.getByRole('button',{name:'Publish'}).click();
  await expect(page.getByText('Published v1')).toBeVisible();
  expect(published).toBe(1);
  expect(savedSections?.some(section=>section.type==='services'&&section.heading==='Plumbing services')).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:testInfo.outputPath('landing-editor.png'),fullPage:true});
});

test('editor keeps an unsaved draft out of published versions',async({page})=>{
  let publishCalls=0;
  await page.route('**/api/landing-pages/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path===`/api/landing-pages/${pageId}`&&route.request().method()==='PATCH')
      return route.fulfill({status:500,contentType:'application/json',body:'{"error":"Save failed"}'});
    if(path===`/api/landing-pages/${pageId}/publish`){publishCalls++;return route.fulfill({status:200,contentType:'application/json',body:'{}'});}
    return route.fallback();
  });
  await page.goto(`/landing-pages/${pageId}`);
  await expect(page.getByRole('heading',{name:'Demo service page'})).toBeVisible();
  await page.getByRole('button',{name:/HeroOriginal heading/}).click();
  await page.getByRole('textbox',{name:'Headline'}).fill('Updated heading');
  await page.getByRole('button',{name:'Publish'}).click();
  await expect(page.getByText('Draft could not be saved',{exact:true})).toBeVisible();
  expect(publishCalls).toBe(0);
});

test('editor hides, duplicates, reorders and removes sections',async({page},testInfo)=>{
  let saved:Array<{id:string;type:string;hidden?:boolean}>|null=null;
  await page.route('**/api/landing-pages/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path===`/api/landing-pages/${pageId}`&&route.request().method()==='PATCH'){
      const body=route.request().postDataJSON() as {sections:Array<{id:string;type:string;hidden?:boolean}>};
      saved=body.sections;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...initialPage,...body})});
    }
    return route.fallback();
  });
  await page.goto(`/landing-pages/${pageId}`);
  await expect(page.getByRole('heading',{name:'Demo service page'})).toBeVisible();
  await page.getByRole('button',{name:'Add section'}).click();
  await page.getByRole('button',{name:'Services grid',exact:true}).click();
  const hero=page.getByRole('button',{name:/HeroOriginal heading/}).locator('..');
  const service=page.getByRole('button',{name:/Services gridOur services/}).locator('..');
  await service.getByRole('button',{name:'Hide'}).click();
  await expect(service.getByRole('button',{name:'Show'})).toBeVisible();
  await service.getByRole('button',{name:'Duplicate'}).click();
  await expect(page.getByRole('button',{name:/Services gridOur services/})).toHaveCount(2);
  await page.getByRole('button',{name:/Services gridOur services/}).last().locator('..')
    .getByRole('button',{name:'Remove'}).click();
  await expect(page.getByRole('button',{name:/Services gridOur services/})).toHaveCount(1);
  if(testInfo.project.name==='mobile')await service.getByRole('button',{name:'Move section up'}).click();
  else await service.dragTo(hero);
  await expect.poll(async()=>page.locator('[draggable="true"] > button:first-child').allTextContents())
    .toEqual(['Services gridOur services','HeroOriginal heading']);
  await expect.poll(()=>saved?.map(section=>section.type)||[]).toEqual(['services','hero']);
  expect(saved?.[0]?.hidden).toBe(true);
});

test('editor restores a published version into the draft',async({page})=>{
  let requestedVersion:number|null=null;
  await page.route('**/api/landing-pages/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path===`/api/landing-pages/${pageId}/versions`)return route.fulfill({status:200,
      contentType:'application/json',body:JSON.stringify({versions:[{version:1,published_at:'2026-10-01T12:00:00Z'}]})});
    if(path===`/api/landing-pages/${pageId}`&&route.request().method()==='GET')return route.fulfill({status:200,
      contentType:'application/json',body:JSON.stringify({...initialPage,status:'published',version:2,
        sections:[{id:'hero-2',type:'hero',heading:'Newer draft',body:'Different details'}]})});
    if(path===`/api/landing-pages/${pageId}/restore`){
      requestedVersion=Number(route.request().postDataJSON()?.version);
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...initialPage,
        sections:[{id:'hero-1',type:'hero',heading:'Original heading',body:'Service details'}]})});
    }
    return route.fallback();
  });
  await page.goto(`/landing-pages/${pageId}`);
  await expect(page.getByRole('heading',{name:'Demo service page'})).toBeVisible();
  await page.getByRole('button',{name:'Version history'}).click();
  await page.getByRole('button',{name:'Restore'}).click();
  await expect(page.getByRole('button',{name:/HeroOriginal heading/})).toBeVisible();
  expect(requestedVersion).toBe(1);
});
