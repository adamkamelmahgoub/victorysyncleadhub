import type {IncomingMessage,ServerResponse} from 'node:http';
import {sendSocialReply} from '../social-reply-service.js';
import {socialActor} from '../social-workspace-auth.js';

export const config={api:{bodyParser:false},maxDuration:30};
function reply(res:ServerResponse,status:number,data:unknown){res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data));}
export default async function handler(req:IncomingMessage,res:ServerResponse){
  if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'});
  try{
    const user=await socialActor(req);
    let raw='';for await(const part of req){raw+=part;if(raw.length>10000)throw new Error('Request too large');}
    const data=JSON.parse(raw||'{}');return reply(res,200,await sendSocialReply(user.id,String(data.conversation_id||''),String(data.body||''),user));
  }catch(error){const message=error instanceof Error?error.message:'Reply failed';return reply(res,message.includes('requires an inbound message')?403:400,{error:message});}
}
