export type CampaignContact={id:string|number;firstName:string;lastName:string;email:string;company?:string|null;status:string;score?:number};
type Request=(path:string,options?:RequestInit)=>Promise<any>;
// Read until the server returns an empty page. Older APIs undercount total at 1,000.
export async function allCampaignContacts(request:Request,signal?:AbortSignal):Promise<{leads:CampaignContact[]}> {
 const leads:CampaignContact[]=[];const seen=new Set<string>();
 for(let page=1;;page++) {
  const data=await request(`/leads?page=${page}&limit=100`,{signal});
  const rows:CampaignContact[]=data.leads??[];
  if(!rows.length)break;
  let added=0;
  for(const row of rows)if(!seen.has(String(row.id))){seen.add(String(row.id));leads.push(row);added++;}
  if(!added)throw new Error('The lead list did not advance. Please reload and retry.');
 }
 return {leads};
}
export async function addCampaignContacts(request:Request,campaignId:string|number,ids:Array<string|number>,progress?:(count:number)=>void) {
 const unique=[...new Map(ids.map(id=>[String(id),id])).values()];
 for(let start=0;start<unique.length;start+=200){
  await request(`/campaigns/${encodeURIComponent(campaignId)}/leads`,{method:'POST',body:JSON.stringify({leadIds:unique.slice(start,start+200)})});
  progress?.(Math.min(start+200,unique.length));
 }
}
