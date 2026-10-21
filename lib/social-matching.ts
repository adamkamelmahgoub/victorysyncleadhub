import {mcpPool} from './mcp-auth.js';
import {normalizeSocial,type SocialPlatform} from './social-handles.js';

export type MatchInput={organizationId:string;repUserId:string|null;platform:'instagram'|'linkedin';providerUserId:string;
  publicIdentifier?:string|null;profileUrl?:string|null;displayName?:string|null};
export type MatchResult={leadId:string|null;status:'matched'|'suggested'|'unmatched';confidence:number;method:string};
type Candidate={lead_id:string;owner_rep_id:string|null;normalized_handle:string|null;profile_url:string|null;first_name:string|null;last_name:string|null;company:string|null};

export function trigramSimilarity(left:string,right:string){
  const grams=(value:string)=>{const normalized=`  ${value.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()} `;
    return new Set(Array.from({length:Math.max(0,normalized.length-2)},(_,index)=>normalized.slice(index,index+3)));};
  const a=grams(left),b=grams(right);if(!a.size||!b.size)return 0;
  let common=0;for(const item of a)if(b.has(item))common++;
  return 2*common/(a.size+b.size);
}
export function chooseSocialMatch(candidates:Candidate[],input:MatchInput):MatchResult{
  const owned=candidates.filter(row=>input.repUserId&&row.owner_rep_id===input.repUserId);
  const platform=input.platform==='linkedin'?'linkedin_person':'instagram';
  let normalized='';try{if(input.publicIdentifier)normalized=normalizeSocial(platform as SocialPlatform,input.publicIdentifier).normalizedHandle;}catch{}
  const url=input.profileUrl?.trim().replace(/[?#].*$/,'').replace(/\/$/,'').toLowerCase()||'';
  const byHandle=normalized&&owned.find(row=>row.normalized_handle===normalized);
  if(byHandle)return {leadId:byHandle.lead_id,status:'matched',confidence:.95,method:'handle'};
  const byUrl=url&&owned.find(row=>row.profile_url?.toLowerCase().replace(/[?#].*$/,'').replace(/\/$/,'')===url);
  if(byUrl)return {leadId:byUrl.lead_id,status:'matched',confidence:.95,method:'profile_url'};
  const display=input.displayName?.trim()||'';
  if(display){
    const ranked=owned.map(row=>({row,score:Math.max(trigramSimilarity(display,`${row.first_name||''} ${row.last_name||''}`),
      trigramSimilarity(display,row.company||''))})).sort((a,b)=>b.score-a.score);
    if(ranked[0]?.score>=.6&&(!ranked[1]||ranked[0].score-ranked[1].score>.12))
      return {leadId:ranked[0].row.lead_id,status:'suggested',confidence:.8,method:'name_company'};
  }
  return {leadId:null,status:'unmatched',confidence:0,method:'none'};
}

export async function matchSocialLead(input:MatchInput):Promise<MatchResult>{
  const platform=input.platform==='linkedin'?'linkedin_person':'instagram';
  const exact=await mcpPool.query<{lead_id:string;owner_rep_id:string|null}>(`select p.entity_id lead_id,l.owner_rep_id
    from public.social_profiles p join public.leads l on l.id=p.entity_id and l.organization_id=p.organization_id
    where p.organization_id=$1 and p.platform=$2 and p.entity_type='lead' and p.platform_user_id=$3 limit 3`,
    [input.organizationId,platform,input.providerUserId]);
  if(exact.rows.length===1)return {leadId:exact.rows[0].lead_id,status:'matched',confidence:1,method:'provider_id'};
  let normalized='';try{if(input.publicIdentifier)normalized=normalizeSocial(platform as SocialPlatform,input.publicIdentifier).normalizedHandle;}catch{}
  if(normalized){
    const byUsername=await mcpPool.query<{lead_id:string}>(`select p.entity_id lead_id from public.social_profiles p
      join public.leads l on l.id=p.entity_id and l.organization_id=p.organization_id
      where p.organization_id=$1 and p.platform=$2 and p.entity_type='lead' and p.normalized_handle=$3 limit 2`,
      [input.organizationId,platform,normalized]);
    if(byUsername.rows.length===1)return {leadId:byUsername.rows[0].lead_id,status:'matched',confidence:.95,method:'handle'};
  }
  if(!input.repUserId)return {leadId:null,status:'unmatched',confidence:0,method:'none'};
  const candidateRows=await mcpPool.query<Candidate>(`select p.entity_id lead_id,l.owner_rep_id,p.normalized_handle,p.profile_url,l.first_name,l.last_name,l.company
    from public.social_profiles p join public.leads l on l.id=p.entity_id and l.organization_id=p.organization_id
    where p.organization_id=$1 and p.platform=$2 and p.entity_type='lead'
      and (p.normalized_handle=$3 or ($4<>'' and lower(rtrim(split_part(p.profile_url,'?',1),'/'))=$4)) limit 10`,
    [input.organizationId,platform,normalized||'__none__',input.profileUrl?.trim().replace(/[?#].*$/,'').replace(/\/$/,'').toLowerCase()||'']);
  const direct=chooseSocialMatch(candidateRows.rows,input);
  if(direct.status==='matched')return direct;
  if(exact.rows.length||candidateRows.rows.some(row=>row.owner_rep_id&&row.owner_rep_id!==input.repUserId)){
    await mcpPool.query(`insert into public.integration_alerts(provider,alert_type,message,metadata)
      values('unipile','possible_double_contact','Social profile belongs to another rep',jsonb_build_object('platform',$1,'provider_user_id',$2))`,
      [platform,input.providerUserId]).catch(()=>{});
    return {leadId:null,status:'suggested',confidence:.6,method:'other_rep'};
  }
  if(!input.displayName)return direct;
  const recent=await mcpPool.query<Candidate>(`select l.id lead_id,l.owner_rep_id,p.normalized_handle,p.profile_url,l.first_name,l.last_name,l.company
    from public.leads l left join public.social_profiles p on p.entity_type='lead' and p.entity_id=l.id and p.platform=$3
    where l.organization_id=$1 and l.owner_rep_id=$2 and exists(select 1 from public.dm_enrollments e
      join public.dm_tasks t on t.enrollment_id=e.id where e.entity_type='lead' and e.entity_id=l.id
      and t.due_at>=now()-interval '14 days' and t.status in ('due','sent')) limit 80`,
    [input.organizationId,input.repUserId,platform]);
  return chooseSocialMatch(recent.rows,input);
}
