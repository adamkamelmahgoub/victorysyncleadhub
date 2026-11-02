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
    if(path===`/api/landing-pages/${pageId}`&&route.request().method()==='GET')return route.fulfill({status:200,
      contentType:'application/json',body:JSON.stringify(initialPage)});
    return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
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
