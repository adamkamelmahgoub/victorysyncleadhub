import type {IncomingMessage,ServerResponse} from 'node:http';
import {reconcileUnipile} from './social-worker.js';

export const config={maxDuration:60};
export default async function handler(req:IncomingMessage,res:ServerResponse){
  const tokens=[process.env.OUTREACH_WORKER_TOKEN,process.env.CRON_SECRET].filter(Boolean);
  if(req.method!=='POST'||!tokens.length||!tokens.some(token=>req.headers.authorization===`Bearer ${token}`)){
    res.statusCode=401;res.end('Unauthorized');return;
  }
  try{const messages=await reconcileUnipile(undefined,'history');
    res.setHeader('content-type','application/json');res.end(JSON.stringify({messages}));
  }catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error)}));}
}
