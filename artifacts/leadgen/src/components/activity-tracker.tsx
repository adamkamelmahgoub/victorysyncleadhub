import {useEffect} from 'react';
import {useLocation} from 'wouter';
import {recordActivity} from '@/lib/activity';
export function ActivityTracker(){
 const [location]=useLocation();
 useEffect(()=>{void recordActivity('navigation','page_viewed',{pagePath:location});},[location]);
 useEffect(()=>{const click=(event:MouseEvent)=>{const element=(event.target as Element|null)?.closest('button,a,input,select,textarea,[role="button"],[data-audit]') as HTMLElement|null;if(!element)return;const label=(element.getAttribute('aria-label')||element.getAttribute('title')||element.getAttribute('data-audit')||element.textContent||element.getAttribute('name')||element.tagName).replace(/\s+/g,' ').trim().slice(0,200);const href=element instanceof HTMLAnchorElement?element.getAttribute('href'):null;void recordActivity('interaction','clicked',{pagePath:window.location.pathname,target:label,metadata:{element:element.tagName.toLowerCase(),href}});};document.addEventListener('click',click,true);return()=>document.removeEventListener('click',click,true);},[]);
 return null;
}
