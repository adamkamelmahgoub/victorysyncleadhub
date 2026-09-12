import {publicEmailUrl} from '../../lib/email-security.js';
async function main() {
 const token=process.env.OUTREACH_WORKER_TOKEN??'';if(token.length<32) throw new Error('Configure OUTREACH_WORKER_TOKEN');
 const response=await fetch(`${publicEmailUrl()}/api/email/process`,{method:'POST',headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(55000)});
 if(!response.ok) throw new Error(`Email worker returned HTTP ${response.status}`);
 const result=await response.json() as {sent?:number;state?:string;held?:boolean};console.log({sent:result.sent??0,state:result.state??(result.held?'disabled':'idle')});
}
main().catch(()=>{console.error('Email worker request failed; check service health and configuration.');process.exitCode=1;});
