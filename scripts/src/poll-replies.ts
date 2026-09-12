import {publicEmailUrl} from '../../lib/email-security.js';
async function main(){
 const token=process.env.OUTREACH_WORKER_TOKEN??'';if(token.length<32)throw new Error('Configure the worker token');
 const response=await fetch(`${publicEmailUrl()}/api/email/poll`,{method:'POST',headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(110000)});
 if(!response.ok)throw new Error('Reply polling failed');
 const result=await response.json() as {polled:number;messages?:number;caughtUp?:boolean;error?:string};
 if(result.error)throw new Error('Reply polling failed');
 console.log({polled:result.polled,messages:result.messages??0,caughtUp:result.caughtUp??false});
}
main().catch(()=>{console.error('Reply polling failed. Check inbox configuration and worker health.');process.exitCode=1;});
