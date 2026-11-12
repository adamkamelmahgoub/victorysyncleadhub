import {test,expect} from '@playwright/test';

const userId='20000000-0000-4000-8000-000000000001';
const eventId='10000000-0000-4000-8000-000000000001';
const appointmentId='30000000-0000-4000-8000-000000000001';
const part=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt=`${part({alg:'HS256',typ:'JWT'})}.${part({sub:userId,role:'authenticated',
  crm_role:'admin',aal:'aal2',exp:4102444800})}.test-signature`;

test('calendar shows real appointments in month and week views with an editable detail',async({page},testInfo)=>{
  await page.addInitScript(({jwt,userId})=>{
    localStorage.setItem('sb-supabase-auth-token',JSON.stringify({access_token:jwt,refresh_token:'fake-refresh',
      token_type:'bearer',expires_in:3600,expires_at:4102444800,
      user:{id:userId,aud:'authenticated',role:'authenticated',email:'admin@example.test',
        app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}}));
  },{jwt,userId});
  const today=new Date(),start=new Date(today.getFullYear(),today.getMonth(),today.getDate(),12);
  const end=new Date(start.getTime()+30*60_000);
  let status='confirmed';
  const writes:Array<Record<string,unknown>>=[];
  const created:Array<Record<string,unknown>>=[];
  await page.route('https://supabase.test/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.route('**/api/**',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.pathname==='/api/portal'){
      const action=url.searchParams.get('action');
      const data=action==='accounts'?{accounts:[{id:eventId,name:'Demo Plumbing'}],
        selected:{accountId:eventId,viewAsClient:false}}:action==='branding'?{name:'Demo Plumbing',logoUrl:null,brand:null}:[];
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    }
    if(url.pathname==='/api/meeting/event-types')return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify([{id:eventId,slug:'consultation',title:'Consultation',color:'#2563eb',
        durationMinutes:30,isActive:true,availableDays:['mon','tue','wed','thu','fri']}])});
    if(url.pathname==='/api/meeting/appointments'&&request.method()==='POST'){
      const body=request.postDataJSON() as Record<string,unknown>;created.push(body);
      return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({id:'new-id',...body,status:'confirmed'})});
    }
    if(url.pathname==='/api/meeting/appointments'&&request.method()==='GET')return route.fulfill({status:200,
      contentType:'application/json',body:JSON.stringify([{id:appointmentId,eventTypeId:eventId,
        guestName:'Alex Customer',guestEmail:'alex@example.test',startAt:start.toISOString(),
        endAt:end.toISOString(),status},...created.map((item,index)=>({id:`new-${index}`,status:'confirmed',...item}))])});
    if(url.pathname===`/api/meeting/appointments/${appointmentId}`&&request.method()==='PATCH'){
      const body=request.postDataJSON() as Record<string,unknown>;writes.push(body);status=String(body.status);
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:appointmentId,status})});
    }
    return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  await page.goto('/calendars');
  await expect(page.getByRole('heading',{name:'Meeting Scheduler'})).toBeVisible();
  const selected=page.getByRole('complementary',{name:'Selected day appointments'});
  await expect(selected.getByText('Alex Customer')).toBeVisible();
  await page.getByRole('button',{name:'Week',exact:true}).click();
  await expect(page.locator('button[aria-label][aria-pressed]')).toHaveCount(7);
  await page.getByRole('button',{name:'Next period'}).click();
  await expect(selected.getByText('No appointments for this day.')).toBeVisible();
  await page.getByRole('button',{name:'Today',exact:true}).click();
  await selected.getByRole('button',{name:/Alex Customer/}).click();
  const dialog=page.getByRole('dialog',{name:'Appointment details'});
  await expect(dialog.getByText('alex@example.test')).toBeVisible();
  await dialog.getByRole('button',{name:'Mark completed'}).click();
  await expect.poll(()=>writes).toEqual([{status:'completed'}]);
  await page.getByRole('button',{name:'Month',exact:true}).click();
  await page.getByRole('button',{name:'New Appointment'}).click();
  const bookingDialog=page.getByRole('dialog',{name:'New Appointment'});
  await bookingDialog.getByRole('combobox',{name:'Event type'}).click();
  await page.getByRole('option',{name:'Consultation (30 min)'}).click();
  await bookingDialog.getByRole('textbox',{name:'Guest name'}).fill('Taylor Client');
  await bookingDialog.getByRole('textbox',{name:'Guest email'}).fill('taylor@example.test');
  await bookingDialog.getByLabel('Start time').fill('2026-11-10T14:00');
  await bookingDialog.getByRole('button',{name:'Create appointment'}).click();
  await expect.poll(()=>created.length).toBe(1);
  expect(created[0]).toMatchObject({eventTypeId:eventId,guestName:'Taylor Client',guestEmail:'taylor@example.test'});
  expect(new Date(String(created[0].endAt)).getTime()-new Date(String(created[0].startAt)).getTime()).toBe(30*60_000);
  await expect(bookingDialog).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
  await page.locator('#workspace-content').evaluate(element=>{element.scrollTop=0});
  await expect(page.getByRole('heading',{name:'Meeting Scheduler'})).toBeInViewport();
  await page.screenshot({path:testInfo.outputPath('meeting-calendar.png'),fullPage:true});
});
