import {test,expect} from '@playwright/test';

const userId='20000000-0000-4000-8000-000000000088';
const companyId='30000000-0000-4000-8000-000000000001';
const part=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt=`${part({alg:'HS256',typ:'JWT'})}.${part({sub:userId,role:'authenticated',
  crm_role:'agency_admin',aal:'aal2',exp:4102444800})}.test-signature`;

test.beforeEach(async({page})=>{
  await page.addInitScript(({jwt,userId})=>{
    localStorage.setItem('sb-supabase-auth-token',JSON.stringify({access_token:jwt,
      refresh_token:'fake-refresh',token_type:'bearer',expires_in:3600,expires_at:4102444800,
      user:{id:userId,aud:'authenticated',role:'authenticated',email:'admin@example.test',
        app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}}));
  },{jwt,userId});
  await page.route('https://supabase.test/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
});

for(const source of ['manual','closed company'] as const){
  test(`agency admin creates a client from ${source} and receives the invite`,async({page},testInfo)=>{
    let provisioned:Record<string,unknown>|null=null;
    await page.route('**/api/**',route=>{
      const request=route.request();const url=new URL(request.url());
      if(url.pathname==='/api/portal'&&request.method()==='POST'){
        const body=request.postDataJSON() as Record<string,unknown>;
        if(body.action==='create_client'||body.action==='create_client_manual'){
          provisioned=body;
          return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({
            accountId:'40000000-0000-4000-8000-000000000001',existing:false,inviteSent:false,
            inviteUrl:'https://app.victorysync.com/login?invite=private-code'})});
        }
      }
      const action=url.searchParams.get('action');
      const data=action==='accounts'?{accounts:[],selected:{accountId:null,viewAsClient:false}}:
        action==='closed_companies'?[{id:companyId,name:'Closed HVAC',email:'owner@example.test',contact_name:'Casey Owner'}]:
        action==='provider_readiness'?{sandbox:true,stripe:false,mightycall:false,invites:false,
          reports:false,slack:false,portalUrl:true,publicPagesUrl:true,worker:true}:[];
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    });
    await page.goto('/client-portal');
    await expect(page.getByRole('heading',{name:'Add a client'})).toBeVisible();
    if(source==='closed company'){
      await page.getByRole('combobox',{name:'Company'}).selectOption(companyId);
    }else{
      await page.getByRole('textbox',{name:'Business name'}).fill('New Plumbing');
      await page.getByRole('textbox',{name:'Owner name'}).fill('Casey Owner');
      await page.getByRole('textbox',{name:'Owner email'}).fill('owner@example.test');
    }
    await page.getByRole('combobox',{name:'Package'}).selectOption('scale');
    await page.getByRole('button',{name:'Create client account'}).click();
    await expect(page.getByRole('textbox',{name:'Client invitation link'})).toHaveValue(/invite=private-code/);
    expect(provisioned).toMatchObject(source==='manual'?{
      action:'create_client_manual',name:'New Plumbing',package:'scale',ownerEmail:'owner@example.test'}:{
      action:'create_client',companyId,package:'scale',ownerEmail:'owner@example.test'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({path:testInfo.outputPath('client-create.png'),fullPage:true});
  });
}
