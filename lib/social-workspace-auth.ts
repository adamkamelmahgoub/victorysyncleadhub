import type { IncomingMessage } from 'node:http';
import { allowedEmail, mcpPool } from './mcp-auth.js';

// Victory Sync's internal CRM organization. Social outreach is never exposed to client workspaces.
export const SOCIAL_WORKSPACE_ORG_ID='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';

export const SOCIAL_PERMISSIONS = [
  'inbox_view','inbox_reply','queue_work','campaign_manage','socials_manage',
  'accounts_manage','posts_create','posts_publish','reports_view','mcp_use',
] as const;
export type SocialPermission = typeof SOCIAL_PERMISSIONS[number];
type Membership = {id:string;org_id:string;role:string;status:string;client_account_id:string|null;permissions:string[]};
export type SocialActor = {id:string;email:string;memberships:Membership[];ownerOrganizations:string[]};

export async function socialActor(req:IncomingMessage):Promise<SocialActor>{
  const bearer=req.headers.authorization;
  const key=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_ANON_KEY;
  const base=process.env.SUPABASE_URL;
  if(typeof bearer!=='string'||!bearer.startsWith('Bearer ')||!key||!base)throw new Error('Sign in first');
  const response=await fetch(`${base}/auth/v1/user`,{headers:{apikey:key,authorization:bearer},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Session expired');
  const user=await response.json() as{id:string;email:string;email_confirmed_at?:string};
  if(!user.email_confirmed_at||!user.email)throw new Error('Confirm your email first');
  const rows=await mcpPool.query<Membership>(`select m.id,m.org_id,m.role,m.status,m.client_account_id,
    coalesce(p.permissions,'{}'::text[]) permissions
    from public.team_members m left join public.social_team_permissions p on p.team_member_id=m.id
    where m.auth_user_id=$1 and m.org_id is not null`,[user.id]);
  const memberships=rows.rows.filter((m)=>m.status==='active'&&m.role!=='client'&&m.role!=='viewer'&&!m.client_account_id);
  let ownerOrganizations:string[]=[];
  if(allowedEmail(user.email)){
    const organizations=await mcpPool.query<{org_id:string}>(`select org_id from public.org_users where user_id=$1`,[user.id]);
    ownerOrganizations=organizations.rows.map((row)=>row.org_id);
    const platform=await mcpPool.query(`select 1 from public.profiles where id=$1 and global_role='platform_admin'`,[user.id]);
    if(platform.rowCount){
      const all=await mcpPool.query<{id:string}>(`select id from public.organizations`);
      ownerOrganizations=all.rows.map((row)=>row.id);
    }
  }
  return {id:user.id,email:user.email,memberships,ownerOrganizations};
}

export function socialActorOrganizations(actor:SocialActor,permission:SocialPermission):string[]{
  return [...new Set([...actor.ownerOrganizations,...actor.memberships
    .filter((m)=>m.role==='owner'||m.permissions.includes(permission)).map((m)=>m.org_id)])]
    .filter((id)=>id===SOCIAL_WORKSPACE_ORG_ID);
}
export function assertSocialPermission(actor:SocialActor,orgId:string,permission:SocialPermission):void{
  if(!socialActorOrganizations(actor,permission).includes(orgId))throw new Error('Social workspace access denied');
}
export function internalSocialOrganization(actor:SocialActor,permission:SocialPermission):string{
  assertSocialPermission(actor,SOCIAL_WORKSPACE_ORG_ID,permission);
  return SOCIAL_WORKSPACE_ORG_ID;
}
export function isSocialOwner(actor:SocialActor,orgId:string):boolean{
  return orgId===SOCIAL_WORKSPACE_ORG_ID&&(actor.ownerOrganizations.includes(orgId)||actor.memberships.some((m)=>m.org_id===orgId&&m.role==='owner'));
}
