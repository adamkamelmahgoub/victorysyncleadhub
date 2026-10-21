import type {IncomingMessage} from 'node:http';

/** Vercel may supply req.body while local Node handlers receive a readable stream. */
export async function readSocialJsonBody(req:IncomingMessage,limit=100000):Promise<Record<string,unknown>>{
  const prepared=(req as IncomingMessage&{body?:unknown}).body;
  if(prepared!==undefined&&prepared!==null){
    const raw=typeof prepared==='string'?prepared:JSON.stringify(prepared);
    if(raw.length>limit)throw new Error('Request too large');
    const parsed=typeof prepared==='string'?JSON.parse(prepared):prepared;
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Expected a JSON object');
    return parsed as Record<string,unknown>;
  }
  let raw='';
  for await(const part of req){raw+=part;if(raw.length>limit)throw new Error('Request too large');}
  const parsed=JSON.parse(raw||'{}');
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Expected a JSON object');
  return parsed as Record<string,unknown>;
}
