import {test,expect} from '@playwright/test';

const userId='20000000-0000-4000-8000-000000000077';
const part=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');

for(const role of ['admin','member','agency_admin','agency_staff']){
  test(`${role} sees authenticator enrollment before agency pages`,async({page},testInfo)=>{
    const jwt=`${part({alg:'HS256',typ:'JWT'})}.${part({sub:userId,role:'authenticated',
      crm_role:role,aal:'aal1',exp:4102444800})}.test-signature`;
    await page.addInitScript(({jwt,userId})=>{
      localStorage.setItem('sb-supabase-auth-token',JSON.stringify({access_token:jwt,
        refresh_token:'fake-refresh',token_type:'bearer',expires_in:3600,expires_at:4102444800,
        user:{id:userId,aud:'authenticated',role:'authenticated',email:'agency@example.test',
          app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}}));
    },{jwt,userId});
    await page.route('https://supabase.test/**',route=>route.fulfill({status:200,
      contentType:'application/json',body:'{}'}));
    await page.route('**/api/auth/sync-session',route=>route.fulfill({status:200,
      contentType:'application/json',body:'{}'}));
    await page.goto('/client-portal');
    await expect(page.getByRole('heading',{name:'Two-step verification required'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Continue'})).toBeVisible();
    await expect(page.getByText('No Lead Gen Hub access')).toHaveCount(0);
    if(role==='admin')await page.screenshot({path:testInfo.outputPath('agency-mfa-gate.png')});
    if(role==='admin'){
      await page.getByRole('button',{name:'Continue'}).click();
      await expect(page.getByRole('alert')).toContainText('Authenticator setup is unavailable');
      await expect(page.getByRole('alert')).not.toContainText('{}');
    }
  });
}

test('agency admin can enroll and verify an authenticator',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop');
  const jwt=(aal:string)=>`${part({alg:'HS256',typ:'JWT'})}.${part({sub:userId,
    role:'authenticated',crm_role:'admin',aal,exp:4102444800})}.test-signature`;
  const user={id:userId,aud:'authenticated',role:'authenticated',email:'agency@example.test',
    app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z',factors:[]};
  await page.addInitScript(({token,user})=>{
    localStorage.setItem('sb-supabase-auth-token',JSON.stringify({access_token:token,
      refresh_token:'fake-refresh',token_type:'bearer',expires_in:3600,expires_at:4102444800,user}));
  },{token:jwt('aal1'),user});
  await page.route('https://supabase.test/**',route=>{
    const url=new URL(route.request().url());
    const body=url.pathname.endsWith('/auth/v1/user')?user:
      url.pathname.endsWith('/auth/v1/factors')?{id:'factor-1',factor_type:'totp',
        totp:{qr_code:'<svg xmlns="http://www.w3.org/2000/svg"></svg>',secret:'TESTSECRET'}}:
      url.pathname.endsWith('/challenge')?{id:'challenge-1'}:
      url.pathname.endsWith('/verify')||url.pathname.endsWith('/token')?
        {access_token:jwt('aal2'),refresh_token:'fake-refresh-2',token_type:'bearer',
          expires_in:3600,user:{...user,factors:[{id:'factor-1',factor_type:'totp',status:'verified'}]}}:{};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.goto('/client-portal');
  await page.getByRole('button',{name:'Continue'}).click();
  await expect(page.getByRole('img',{name:'Authenticator QR code'})).toBeVisible();
  await page.getByRole('textbox',{name:'Authenticator code'}).fill('123456');
  await page.getByRole('button',{name:'Verify code'}).click();
  await expect(page.getByRole('heading',{name:'Two-step verification required'})).toHaveCount(0);
});
