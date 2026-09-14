import {supabase} from './supabase';
const BASE=import.meta.env.BASE_URL.replace(/\/$/,'');
const sessionId=(()=>{const key='victorysync_activity_session';let value=sessionStorage.getItem(key);if(!value){value=crypto.randomUUID();sessionStorage.setItem(key,value);}return value;})();
export async function recordActivity(eventType:string,action:string,details:Record<string,unknown>={}){
 try{const {data}=await supabase.auth.getSession();if(!data.session)return;await fetch(`${BASE}/api/activity/events`,{method:'POST',keepalive:true,headers:{authorization:`Bearer ${data.session.access_token}`,'content-type':'application/json'},body:JSON.stringify({eventType,action,sessionId,...details})});}catch{/* Activity telemetry must never break an operator action. */}
}
