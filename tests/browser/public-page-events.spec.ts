import {test,expect} from '@playwright/test';
import {renderPage} from '../../lib/landing-renderer';

const pageId='40000000-0000-4000-8000-000000000011';
test('public page forwards call, form start, and form submit events to configured tags',async({page})=>{
  await page.route('https://www.googletagmanager.com/**',route=>route.fulfill({status:200,contentType:'text/javascript',body:''}));
  await page.route('https://connect.facebook.net/**',route=>route.fulfill({status:200,contentType:'text/javascript',body:''}));
  await page.route('**/f/lead**',route=>route.fulfill({status:200,contentType:'text/html',
    body:`<input placeholder="Phone"><button onclick="parent.postMessage({type:'landing-form-submit',pageId:'${pageId}'},location.origin)">Submit</button><script>document.querySelector('input').addEventListener('focus',()=>parent.postMessage({type:'landing-form-start',pageId:'${pageId}'},location.origin))</script>`}));
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.setContent(renderPage({id:pageId,name:'Plumbing',sections:[
    {id:'hero',type:'hero',heading:'Plumbing in Austin',buttonText:'Call',buttonUrl:'tel:+15125550100'},
    {id:'form',type:'form',heading:'Get a quote'}],theme:{primary:'#245eea'},
    tracking:{gtm_id:'GTM-ABC123',ga4_id:'G-ABC123',meta_pixel_id:'123456789'}},'lead'));
  await page.evaluate(()=>{
    const state=window as typeof window & {__ga:string[];__meta:string[];__beacons:string[];
      gtag:(...args:unknown[])=>void;fbq:(...args:unknown[])=>void};
    state.__ga=[];state.__meta=[];state.__beacons=[];
    state.gtag=(...args)=>state.__ga.push(String(args[1]));
    state.fbq=(...args)=>state.__meta.push(String(args[1]));
    navigator.sendBeacon=((url:string)=>{state.__beacons.push(url);return true}) as typeof navigator.sendBeacon;
    document.addEventListener('click',event=>{if((event.target as Element).closest('a[href^="tel:"]'))event.preventDefault()},true);
  });
  await page.getByRole('link',{name:'Call'}).click();
  await page.frameLocator('iframe[title="Lead capture form"]').getByPlaceholder('Phone').focus();
  await page.frameLocator('iframe[title="Lead capture form"]').getByRole('button',{name:'Submit'}).click();
  await expect.poll(()=>page.evaluate(()=>{
    const state=window as typeof window & {dataLayer:Array<{event?:string}>;__ga:string[];__meta:string[];__beacons:string[]};
    return {events:state.dataLayer.filter(item=>item?.event).map(item=>item.event),
      ga:state.__ga,meta:state.__meta,beacons:state.__beacons};
  })).toMatchObject({events:expect.arrayContaining(['phone_click','form_start','form_submit']),
    ga:expect.arrayContaining(['phone_click','form_start','form_submit']),
    meta:expect.arrayContaining(['phone_click','form_start','form_submit']),
    beacons:['/api/landing-pages/event','/api/landing-pages/event']});
});
