import type {IncomingMessage,ServerResponse} from 'node:http';
import {allowedEmail} from '../lib/mcp-auth.js';
import {sendSocialReply} from '../lib/social-reply-service.js';

export const config={api:{bodyParser:false},maxDuration:30};
function reply(res:ServerResponse,status:number,data:unknown){res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data));}
export default async function handler(req:IncomingMessage,res:ServerResponse){
  if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'});
  try{
    const auth=req.headers.authorization,key=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_ANON_KEY;
    if(typeof auth!=='string'||!auth.startsWith('Bearer ')||!key||!process.env.SUPABASE_URL)throw new Error('Sign in first');
    const result=await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:key,authorization:auth},signal:AbortSignal.timeout(10000)});
    if(!result.ok)throw new Error('Session expired');
    const user=await result.json() as{id:string;email:string;email_confirmed_at?:string};
    if(!user.email_confirmed_at||!allowedEmail(user.email))throw new Error('CRM administrator access required');
    let raw='';for await(const part of req){raw+=part;if(raw.length>10000)throw new Error('Request too large');}
    const data=JSON.parse(raw||'{}');return reply(res,200,await sendSocialReply(user.id,String(data.conversation_id||''),String(data.body||'')));
  }catch(error){return reply(res,400,{error:error instanceof Error?error.message:'Reply failed'});}
}
