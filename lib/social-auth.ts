import { socialRest } from './social-service.js';

/** Mirror the explicit organization boundary when server code uses the service key. */
export async function socialOrganizationIds(userId:string):Promise<string[]> {
  const admins=await socialRest<Array<{id:string}>>(`profiles?id=eq.${encodeURIComponent(userId)}&global_role=eq.platform_admin&select=id&limit=1`);
  if(admins.length){const organizations=await socialRest<Array<{id:string}>>('organizations?select=id&limit=1000');return organizations.map((org)=>org.id);}
  const memberships=await socialRest<Array<{org_id:string}>>(`org_users?user_id=eq.${encodeURIComponent(userId)}&select=org_id&limit=1000`);
  return [...new Set(memberships.map((row)=>row.org_id))];
}
export async function assertSocialOrganization(userId:string,orgId:string):Promise<void> {
  if(!(await socialOrganizationIds(userId)).includes(orgId))throw new Error('Organization access denied');
}
