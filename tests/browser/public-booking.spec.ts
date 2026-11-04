import {expect,test} from '@playwright/test';

test('anonymous visitor can book an available meeting time',async({page},testInfo)=>{
  const slot='2026-11-10T14:00:00.000Z';
  const writes:Array<Record<string,unknown>>=[];
  await page.route('**/api/public/booking/consultation',route=>{
    if(route.request().method()==='POST'){
      writes.push(route.request().postDataJSON() as Record<string,unknown>);
      return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({id:'booked',startAt:slot})});
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      event:{title:'Plumbing consultation',description:'Tell us about your project.',durationMinutes:30,timezone:'America/New_York'},
      slots:[slot],
    })});
  });
  await page.goto('/book/consultation');
  await expect(page.getByRole('heading',{name:'Plumbing consultation'})).toBeVisible();
  await page.getByRole('button',{name:/9:00 AM/}).click();
  await page.getByRole('textbox',{name:'Name'}).fill('Taylor Customer');
  await page.getByRole('textbox',{name:'Email'}).fill('taylor@example.test');
  await page.getByRole('button',{name:'Confirm booking'}).click();
  await expect(page.getByRole('heading',{name:'Your meeting is booked'})).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({slot,guestName:'Taylor Customer',guestEmail:'taylor@example.test'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:testInfo.outputPath('public-booking.png'),fullPage:true});
});
