import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ResendInbox,ImapInbox} from '../artifacts/api-server/src/lib/inbox-adapters.js';

test('Resend inbox resumes pagination, filters recipients and catches arrivals during a scan',async()=>{
 const requests:string[]=[];
 const adapter=new ResendInbox('test-key',async(url)=>{
  const path=String(url);requests.push(path);
  if(path.includes('after=older'))return Response.json({data:[{id:'checkpoint',created_at:'2026-09-12T12:00:00Z'}],has_more:true});
  if(path.includes('/emails/receiving?'))return Response.json({has_more:true,data:[{id:'new',to:['Sender <sender@example.test>'],from:'reply@lead.test',created_at:'2026-09-12T13:00:00Z'},{id:'older',to:['someone@else.test'],created_at:'2026-09-12T12:30:00Z'}]});
  return Response.json({id:'new',from:'Person <reply@lead.test>',text:'Interested',subject:'Re: Hi',created_at:'2026-09-12T13:00:00Z',headers:{'Auto-Submitted':'no'}});
 });
 const mailbox={from_email:'sender@example.test',inbox_configured_at:'2026-09-10T00:00:00Z',inbox_cursor:{latest:'checkpoint'}};
 const first=await adapter.poll(mailbox);assert.equal(first.caughtUp,false);assert.equal(first.messages.length,1);assert.equal(first.messages[0].from,'reply@lead.test');assert.equal(first.cursor.after,'older');
 const second=await adapter.poll({...mailbox,inbox_cursor:first.cursor});assert.equal(second.caughtUp,true);assert.deepEqual(second.cursor,{latest:'new'});assert.equal(requests.length,3);
});

test('IMAP uses read-only TLS access, UIDVALIDITY and stable cursors without logging credentials',async()=>{
 let searched:any,locked=false,released=false,loggedOut=false;
 const fake:any={mailbox:{uidValidity:2n,uidNext:3},on(){},async connect(){},async getMailboxLock(_folder:string,options:any){assert.equal(options.readOnly,true);locked=true;return {release(){released=true;}};},async search(query:any,options:any){searched=query;assert.equal(options.uid,true);return [1,2];},async *fetch(ids:number[]){assert.deepEqual(ids,[1,2]);for(const uid of ids)yield {uid,internalDate:new Date('2026-09-12T12:00:00Z'),source:Buffer.from('From: Person <reply@lead.test>\r\nSubject: Out of office\r\nAuto-Submitted: auto-replied\r\nContent-Type: text/plain\r\n\r\nI return on September 15, 2026.')}},async logout(){loggedOut=true;},close(){}};
 const adapter=new ImapInbox({host:'imap.example.test',port:993,user:'sender',password:'test-only',folder:'INBOX'},options=>{assert.equal(options.logger,false);assert.equal(options.secure,true);return fake;});
 const result=await adapter.poll({inbox_configured_at:'2026-09-10T00:00:00Z',inbox_cursor:{validity:'1',uid:99}});
 assert.equal(searched.uid,'1:2');assert.equal(result.messages.length,2);assert.equal(result.messages[0].headers['auto-submitted'],'auto-replied');assert.deepEqual(result.cursor,{validity:'2',uid:2});assert.ok(result.caughtUp&&locked&&released&&loggedOut);
});
