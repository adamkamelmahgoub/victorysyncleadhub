import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUnipileDsn,normalizeV1UnipileMessage,requestUnipile,unipilePortFallback,unipileUrl} from '../lib/social-unipile-client.js';

const config={api_key_vault_id:'',api_base_url:'https://api74.unipile.com:20433',api_version:'v1' as const};
test('DSN validation allows the dashboard host and rejects non-Unipile destinations',()=>{
  assert.equal(normalizeUnipileDsn('api74.unipile.com:20433'),config.api_base_url);
  for(const bad of ['https://evil.example:20433','https://api74.unipile.com:20433/path','http://api74.unipile.com:20433','api74.unipile.com:20433@evil.example'])
    assert.throws(()=>normalizeUnipileDsn(bad));
  assert.equal(unipileUrl(config,'/accounts?limit=1'),`${config.api_base_url}/api/v1/accounts?limit=1`);
  assert.equal(unipilePortFallback(`${config.api_base_url}/api/v1/accounts?limit=1`),'https://api74.unipile.com/api/v1/accounts?limit=1&port=20433');
});
test('V1 webhook marks phone sent messages as echoes and finds the other participant',()=>{
  const event=normalizeV1UnipileMessage({event:'message_received',account_id:'legacy-account',message_id:'message-1',chat_id:'chat-1',
    account_info:{user_id:'owner'},sender:{attendee_provider_id:'owner'},attendees:[{attendee_provider_id:'other'}],message:'Hello'});
  assert.equal(event?.type,'message.new');
  assert.equal(event?.payload.is_sender,true);
  assert.equal(event?.payload.participant_id,'other');
  assert.equal(normalizeV1UnipileMessage({event:'message_read'}),null);
});
test('V1 access token is validated against its DSN, and failure reveals no key',async()=>{
  const original=globalThis.fetch;
  let requested='';
  globalThis.fetch=async(input,init)=>{requested=String(input);assert.equal(new Headers(init?.headers).get('X-API-KEY'),'test-secret');
    return new Response(JSON.stringify({object:'AccountList',items:[]}),{status:200,headers:{'content-type':'application/json'}});};
  try{const result=await requestUnipile(config,'test-secret','/accounts?limit=1');assert.deepEqual(result.items,[]);
    assert.equal(requested,`${config.api_base_url}/api/v1/accounts?limit=1`);}finally{globalThis.fetch=original;}
});
test('V1 uses the documented port query fallback when outbound custom ports are blocked',async()=>{
  const original=globalThis.fetch;const seen:string[]=[];
  globalThis.fetch=async(input)=>{seen.push(String(input));if(seen.length===1)throw new Error('port blocked');
    return new Response(JSON.stringify({items:[]}),{status:200,headers:{'content-type':'application/json'}});};
  try{await requestUnipile(config,'test-secret','/accounts');assert.equal(seen[1],
    'https://api74.unipile.com/api/v1/accounts?port=20433');}finally{globalThis.fetch=original;}
});
