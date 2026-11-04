import {test,expect} from '@playwright/test';

const userId='20000000-0000-4000-8000-000000000088';
const accountId='10000000-0000-4000-8000-000000000001';
const otherId='10000000-0000-4000-8000-000000000002';
const part=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt=`${part({alg:'HS256',typ:'JWT'})}.${part({sub:userId,role:'authenticated',
  crm_role:'agency_admin',aal:'aal2',exp:4102444800})}.test-signature`;

test('view as client hides agency actions and exits through a logged switch',async({page})=>{
  await page.addInitScript(({jwt,userId})=>{
    localStorage.setItem('sb-supabase-auth-token',JSON.stringify({access_token:jwt,
      refresh_token:'fake-refresh',token_type:'bearer',expires_in:3600,expires_at:4102444800,
      user:{id:userId,aud:'authenticated',role:'authenticated',email:'admin@example.test',
        app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}}));
  },{jwt,userId});
  let viewAsClient=true;
  let exitRequested=false;
  await page.route('https://supabase.test/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.route('**/api/**',route=>{
    const request=route.request();const url=new URL(request.url());
    if(url.pathname==='/api/portal'&&request.method()==='POST'){
      const body=request.postDataJSON() as {action?:string;viewAsClient?:boolean};
      if(body.action==='switch'){viewAsClient=body.viewAsClient===true;exitRequested=!viewAsClient;}
      return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    }
    const action=url.searchParams.get('action');
    const data=action==='accounts'?{accounts:viewAsClient?[{id:accountId,name:'Demo Plumbing'}]:[
      {id:accountId,name:'Demo Plumbing'},{id:otherId,name:'Other HVAC'}],
      selected:{accountId,viewAsClient}}:
      action==='branding'?{name:'Demo Plumbing',logoUrl:null,brand:null}:
      action==='snapshot'?{accountId,readOnly:viewAsClient,data:[]}:
      action==='metrics'?{account:{id:accountId,name:'Demo Plumbing',goal_metric:'new_leads',goal_value:20},
        newLeads:0,bookedJobs:0,answeredCalls:0,missedCallsRecovered:0,reviewsReceived:0,
        averageRating:0,adSpendCents:0,sourceBreakdown:{}}:[];
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('/client-portal/dashboard');
  await expect(page.getByText('Viewing as client. Changes are disabled.')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Monthly ad spend'})).toHaveCount(0);
  await expect(page.getByRole('option',{name:'Agency view'})).toHaveCount(0);
  const openMenu=page.getByRole('button',{name:'Open menu'});
  if(await openMenu.isVisible()) await openMenu.click();
  const navigation=page.getByRole('navigation',{name:'Workspace navigation'});
  await expect(navigation.getByRole('link',{name:'Conversations'})).toHaveCount(0);
  await expect(navigation.getByRole('link',{name:'Calls'})).toHaveCount(1);
  const closeNavigation=page.getByRole('button',{name:'Close navigation'});
  if(await closeNavigation.isVisible()) await closeNavigation.click({position:{x:(page.viewportSize()?.width??390)-10,y:100}});
  await page.getByRole('button',{name:'End client view'}).click();
  await expect(page.getByText('Viewing as client. Changes are disabled.')).toHaveCount(0);
  expect(exitRequested).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
});
