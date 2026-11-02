import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const accountId='10000000-0000-4000-8000-000000000001';
const userId='20000000-0000-4000-8000-000000000001';
const tokenPart=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt=`${tokenPart({alg:'HS256',typ:'JWT'})}.${tokenPart({sub:userId,role:'authenticated',
  crm_role:'admin',crm_client_account_id:accountId,aal:'aal2',exp:4102444800})}.test-signature`;
const source={id:'30000000-0000-4000-8000-000000000001',platform:'google',name:'Demo Google profile',
  reviewUrl:'https://example.test/review',status:'active',reviewCount:1,avgRating:'5.0',isActive:true,
  createdAt:'2026-10-01T12:00:00Z'};
const review={id:'40000000-0000-4000-8000-000000000001',platform:'google',reviewer:'Synthetic QA Customer',
  rating:5,text:'Synthetic QA review',reply:null,reviewUrl:'https://example.test/review/1',
  isRead:true,createdAt:'2026-10-15T12:00:00Z'};

test.beforeEach(async({page})=>{
  await page.addInitScript(({jwt,userId})=>{
    localStorage.setItem('sb-supabase-auth-token',JSON.stringify({access_token:jwt,refresh_token:'fake-refresh',
      token_type:'bearer',expires_in:3600,expires_at:4102444800,
      user:{id:userId,aud:'authenticated',role:'authenticated',email:'admin@example.test',
        app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}}));
  },{jwt,userId});
  await page.route('https://supabase.test/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.route('**/api/**',route=>{
    const url=new URL(route.request().url()),path=url.pathname;
    const data=path==='/api/auth/sync-session'?{}:
      path==='/api/portal'&&url.searchParams.get('action')==='accounts'?{accounts:[{id:accountId,name:'Demo Plumbing'}],selected:{accountId,viewAsClient:false}}:
      path==='/api/review-sources'?[source]:path==='/api/reviews/stats'?{total:1,avgRating:'5.0',
        byRating:[{rating:5,count:1}],byPlatform:[{platform:'google',count:1,avg:'5.0'}],unreplied:1}:
      path==='/api/reviews'?[review]:path==='/api/review-requests'?[]:[];
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
});

test('reputation overview and review details fit the viewport',async({page},testInfo)=>{
  await page.goto('/reputation');
  await expect(page.getByRole('heading',{name:'Reputation Management'})).toBeVisible();
  await expect(page.getByText('Overall Rating')).toBeVisible();
  await page.getByRole('button',{name:/Reviews \(1\)/}).click();
  await expect(page.getByText('Synthetic QA Customer')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(result.violations.filter(item=>['critical','serious'].includes(item.impact||''))
    .flatMap(item=>item.nodes.map(node=>`${item.id}: ${node.target.join(' ')} ${node.failureSummary} ${node.html}`))).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('reputation.png'),fullPage:true});
});

test('agency user adds a review source to the selected account',async({page})=>{
  let submitted:Record<string,unknown>|null=null;
  const sources=[source];
  await page.route('**/api/review-sources',route=>{
    if(route.request().method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(sources)});
    if(route.request().method()!=='POST')return route.fallback();
    submitted=route.request().postDataJSON() as Record<string,unknown>;
    const created={...source,id:'30000000-0000-4000-8000-000000000002',name:String(submitted.name)};
    sources.push(created);
    return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify(created)});
  });
  await page.goto('/reputation');
  await page.getByRole('button',{name:/Sources \(1\)/}).click();
  await page.getByRole('button',{name:'Add Source'}).click();
  const dialog=page.getByRole('dialog',{name:'Add review source'});
  await dialog.getByPlaceholder('My Google Reviews').fill('Second Google profile');
  await dialog.getByPlaceholder('https://g.page/r/[place-id]/review').fill('https://example.test/review');
  await dialog.getByRole('button',{name:'Add Source'}).click();
  await expect(page.getByText('Review source added!')).toBeVisible();
  await expect(page.getByRole('button',{name:'Sources (2)'})).toBeVisible();
  await expect(page.getByText('Second Google profile')).toBeVisible();
  expect(submitted).toMatchObject({platform:'google',name:'Second Google profile',reviewUrl:'https://example.test/review'});
});

test('agency user must attest a sourced review before recording it',async({page})=>{
  let submitted:Record<string,unknown>|null=null;
  await page.route('**/api/reviews',route=>{
    if(route.request().method()!=='POST')return route.fallback();
    submitted=route.request().postDataJSON() as Record<string,unknown>;
    return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify(review)});
  });
  await page.goto('/reputation');
  await page.getByRole('button',{name:'Add Review'}).first().click();
  const dialog=page.getByRole('dialog',{name:'Add review'});
  await dialog.getByPlaceholder('John Smith').fill('Synthetic QA Customer');
  await dialog.getByPlaceholder('https://...').fill('https://example.test/review/1');
  const submit=dialog.getByRole('button',{name:'Add Review'});
  await expect(submit).toBeDisabled();
  await dialog.getByRole('checkbox',{name:/I confirm this is a real customer review/}).check();
  await submit.click();
  await expect(page.getByText('Review added.')).toBeVisible();
  expect(submitted).toMatchObject({reviewer:'Synthetic QA Customer',reviewUrl:'https://example.test/review/1',
    confirmedReal:true});
});

test('reputation load error can be retried after the data source recovers',async({page})=>{
  let failing=true;
  await page.route('**/api/review-sources',route=>route.fulfill({status:failing?503:200,
    contentType:'application/json',body:failing?'{"error":"Source unavailable"}':JSON.stringify([source])}));
  await page.goto('/reputation');
  await expect(page.getByRole('alert').filter({hasText:'Could not load reputation data'})).toBeVisible({timeout:20_000});
  failing=false;
  await page.getByRole('button',{name:'Retry'}).click();
  await expect(page.getByRole('button',{name:'Sources (1)'})).toBeVisible();
  await expect(page.getByRole('alert').filter({hasText:'Could not load reputation data'})).toHaveCount(0);
});

test('agency overview keeps reputation writes scoped to a selected client',async({page})=>{
  await page.route('**/api/portal?action=accounts',route=>route.fulfill({status:200,
    contentType:'application/json',body:JSON.stringify({accounts:[{id:accountId,name:'Demo Plumbing'}],
      selected:{accountId:null,viewAsClient:false}})}));
  await page.goto('/reputation');
  await expect(page.getByText('Agency view shows reviews across accessible accounts.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Add Review'}).first()).toBeDisabled();
  await page.getByRole('button',{name:/Sources \(1\)/}).click();
  await expect(page.getByRole('button',{name:'Add Source'})).toBeDisabled();
  await page.getByRole('button',{name:/Reviews \(1\)/}).click();
  await expect(page.getByRole('button',{name:'Delete review'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Draft a reply note'})).toHaveCount(0);
});
