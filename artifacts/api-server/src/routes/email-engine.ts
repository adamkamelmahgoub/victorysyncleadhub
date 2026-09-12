import {Router,type IRouter} from 'express';
import {pool} from '@workspace/db';
import {EmailService,isEmailEndpoint,isPublicEmailEndpoint,type EmailRpc} from '../../../../lib/email-service.js';
import {EmailInputError} from '../../../../lib/email-security.js';
import {mailboxTransport} from '../lib/email-transports.js';
import {inboxAdapter} from '../lib/inbox-adapters.js';
const rpc:EmailRpc=async(name,data)=>{
 if(!/^outreach_(email|sequence)_[a-z_]+$/.test(name)) throw new Error('Invalid email RPC');
 const keys=Object.keys(data);const args=keys.map((k,i)=>`${k} => $${i+1}`).join(',');
 const {rows}=await pool.query(`select public.${name}(${args}) as result`,Object.values(data));return rows[0].result;
};
const service=new EmailService(rpc,mailboxTransport,undefined,undefined,undefined,inboxAdapter);
export function emailEngineRouter(publicOnly=false):IRouter {
 const router=Router();
 router.use(async(req,res,next)=>{
  if(!isEmailEndpoint(req.path) || publicOnly!==isPublicEmailEndpoint(req.path)) {next();return;}
  try {
   const user=res.locals.user;const metadata=user?.user_metadata;
   const body=req.path==='/email/unsubscribe'?{token:req.query.token}:req.body;
   const reply=await service.handle({path:req.path,method:req.method,body,raw:(req as any).rawEmailBody??'',headers:Object.fromEntries(Object.entries(req.headers).map(([k,v])=>[k,Array.isArray(v)?v[0]??'':v??''])),actor:user?.id??'operator',scope:metadata?.role==='agent'?metadata.client_account_id??'__unassigned__':null,authenticated:!publicOnly});
   res.setHeader('Cache-Control','no-store');res.status(reply.status);if(reply.text) res.type('text/plain').send(reply.body);else res.json(reply.body);
  }catch(error){res.status(error instanceof EmailInputError?400:503).json({error:error instanceof EmailInputError?error.message:'Email operation could not be completed. Check configuration and retry.'});}
 });return router;
}
