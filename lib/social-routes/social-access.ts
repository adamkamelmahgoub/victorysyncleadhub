import type {IncomingMessage,ServerResponse} from 'node:http';
import {mcpPool} from '../mcp-auth.js';
import {socialActor,isSocialOwner,SOCIAL_PERMISSIONS} from '../social-workspace-auth.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const answer=(res:ServerResponse,status:number,data:unknown)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data));};
export default async function handler(req:IncomingMessage,res:ServerResponse){
  try{
    const actor=await socialActor(req);
    if(req.method==='GET'){
      const organizationId=new URL(req.url||'/', 'https://local.invalid').searchParams.get('organization_id')||'';
      if(!uuid.test(organizationId)||!isSocialOwner(actor,organizationId))throw new Error('Owner access required');
      const members=await mcpPool.query(`select m.id,m.name,m.email,m.role,m.status,m.org_id organization_id,
        coalesce(p.permissions,'{}'::text[]) permissions
        from public.team_members m left join public.social_team_permissions p on p.team_member_id=m.id
        where m.org_id=$1 and m.client_account_id is null and m.role not in ('client','viewer') order by m.name`,[organizationId]);
      return answer(res,200,{members:members.rows,available:SOCIAL_PERMISSIONS});
    }
    if(req.method!=='PATCH')return answer(res,405,{error:'Method not allowed'});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>10000)throw new Error('Request too large');}
    const input=JSON.parse(raw||'{}') as{organization_id?:string;team_member_id?:string;permissions?:unknown};
    if(!uuid.test(input.organization_id||'')||!uuid.test(input.team_member_id||'')||!isSocialOwner(actor,input.organization_id!))
      throw new Error('Owner access required');
    if(!Array.isArray(input.permissions)||input.permissions.some((value)=>!SOCIAL_PERMISSIONS.includes(value)))throw new Error('Invalid social permissions');
    const members=await mcpPool.query(`select role from public.team_members where id=$1 and org_id=$2 and client_account_id is null
      and role not in ('client','viewer') and status='active'`,[input.team_member_id,input.organization_id]);
    if(!members.rowCount||members.rows[0].role==='owner')throw new Error('Choose an active internal team member');
    const permissions=[...new Set(input.permissions)] as string[];
    await mcpPool.query(`insert into public.social_team_permissions(team_member_id,organization_id,permissions,updated_by)
      values($1,$2,$3,$4) on conflict(team_member_id) do update set permissions=excluded.permissions,
      updated_by=excluded.updated_by,updated_at=now()`,[input.team_member_id,input.organization_id,permissions,actor.id]);
    await mcpPool.query(`insert into public.social_workspace_audit(organization_id,actor_id,action,target_type,target_id,metadata)
      values($1,$2,'permissions_updated','team_member',$3,$4)`,[input.organization_id,actor.id,input.team_member_id,{permissions}]);
    return answer(res,200,{updated:true});
  }catch(error){return answer(res,400,{error:error instanceof Error?error.message:'Access request failed'});}
}
