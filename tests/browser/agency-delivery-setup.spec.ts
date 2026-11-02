import {test,expect} from '@playwright/test';

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
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:testInfo.outputPath('agency-delivery-setup.png'),fullPage:true});
});
