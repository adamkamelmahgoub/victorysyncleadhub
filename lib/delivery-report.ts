export type DeliveryFailure={recipient:string;action:string;status:string};
export type DeliveryReport={messageIds:string[];recipients:DeliveryFailure[]};
function fields(text:string){return Object.fromEntries(text.replace(/\r\n/g,'\n').replace(/\n[ \t]+/g,' ').split('\n').filter(l=>l.includes(':')).map(l=>[l.slice(0,l.indexOf(':')).toLowerCase(),l.slice(l.indexOf(':')+1).trim()]));}
// Parse only machine-readable DSNs, never infer a bounce from ordinary reply text.
export function deliveryReport(attachments:Array<{contentType:string;content:Buffer}>,isReport:boolean):DeliveryReport|undefined {
 const statusParts=attachments.filter(a=>a.contentType.toLowerCase()==='message/delivery-status');
 if(!statusParts.length){if(isReport)throw new Error('Delivery report is incomplete');return undefined;}
 const recipients:DeliveryFailure[]=[];const messageIds=new Set<string>();
 for(const part of attachments){
  if(['message/rfc822','text/rfc822-headers','message/global-headers'].includes(part.contentType.toLowerCase())){
   const h=fields(part.content.toString('utf8').split(/\r?\n\r?\n/)[0]);
   for(const id of (h['message-id']??'').matchAll(/<[^<>\s]+@[^<>\s]+>/g))messageIds.add(id[0]);
  }
 }
 for(const part of statusParts){
  for(const block of part.content.toString('utf8').split(/\r?\n\r?\n/)){
   const h=fields(block);
   for(const id of (h['original-message-id']??'').matchAll(/<[^<>\s]+@[^<>\s]+>/g))messageIds.add(id[0]);
   const value=h['original-recipient']??h['final-recipient'];
   if(!value)continue;
   const recipient=value.replace(/^[^;]+;\s*/,'').trim().toLowerCase();
   if(!/^[^\s<>@]+@[^\s<>@]+$/.test(recipient)||!h.action||!/^\d\.\d{1,3}\.\d{1,3}$/.test(h.status??''))throw new Error('Invalid delivery report');
   recipients.push({recipient,action:h.action.toLowerCase(),status:h.status});
  }
 }
 if(!recipients.length)throw new Error('Delivery report has no recipient status');
 return {messageIds:[...messageIds],recipients};
}
