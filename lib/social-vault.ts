import { mcpPool } from './mcp-auth.js';

export async function socialVaultRead(id:string):Promise<string>{
  const result=await mcpPool.query<{decrypted_secret:string}>(
    'select decrypted_secret from vault.decrypted_secrets where id=$1::uuid limit 1',[id]);
  if(!result.rows[0]?.decrypted_secret)throw new Error('Social credential is unavailable');
  return result.rows[0].decrypted_secret;
}

export async function socialVaultWrite(name:string,value:string,description:string):Promise<string>{
  const existing=await mcpPool.query<{id:string}>('select id from vault.secrets where name=$1 limit 1',[name]);
  if(existing.rows[0]){
    await mcpPool.query('select vault.update_secret($1::uuid,$2)',[existing.rows[0].id,value]);
    return existing.rows[0].id;
  }
  const created=await mcpPool.query<{id:string}>('select vault.create_secret($1,$2,$3) id',[value,name,description]);
  return created.rows[0].id;
}

export async function socialAccountToken(accountId:string):Promise<string>{
  const result=await mcpPool.query<{vault_access_token_id:string|null;encrypted_access_token:string|null}>(
    'select vault_access_token_id,encrypted_access_token from public.connected_account_secrets where connected_account_id=$1',[accountId]);
  if(!result.rows[0])throw new Error('Connected account token missing');
  if(result.rows[0].vault_access_token_id)return socialVaultRead(result.rows[0].vault_access_token_id!);
  if(result.rows[0].encrypted_access_token){
    const {decryptToken}=await import('./social-crypto.js');
    return decryptToken(result.rows[0].encrypted_access_token!);
  }
  throw new Error('Connected account token missing');
}

export async function socialGraphVersion(organizationId:string):Promise<string>{
  const result=await mcpPool.query<{graph_version:string}>(
    'select graph_version from public.social_oauth_apps where organization_id=$1',[organizationId]);
  const version=result.rows[0]?.graph_version||process.env.META_GRAPH_VERSION;
  if(!version||!/^v\d+\.\d+$/.test(version))throw new Error('Configure the Meta Graph API version in Connected Accounts');
  return version;
}
export async function refreshThreadsAccounts(limit=10):Promise<{refreshed:number;failed:number}>{
  const accounts=await mcpPool.query<{id:string}>(`select id from public.connected_accounts where organization_id='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1' and platform='threads' and connection_mode='api'
    and status='active' and (token_expires_at is null or token_expires_at<now()+interval '14 days')
    order by token_expires_at nulls first limit $1`,[limit]);
  let refreshed=0,failed=0;
  for(const account of accounts.rows){
    try{
      const token=await socialAccountToken(account.id);
      const response=await fetch('https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token',{
        headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
      const data=await response.json() as{access_token?:string;expires_in?:number};
      if(!response.ok||!data.access_token||!data.expires_in)throw new Error(`Threads token refresh rejected (${response.status})`);
      const id=await socialVaultWrite(`victorysync_social_account_${account.id}`,data.access_token,'Threads user access token');
      await mcpPool.query(`update public.connected_account_secrets set vault_access_token_id=$2,updated_at=now() where connected_account_id=$1`,[account.id,id]);
      await mcpPool.query(`update public.connected_accounts set token_expires_at=now()+($2::int*interval '1 second'),last_error=null,updated_at=now() where id=$1`,[account.id,data.expires_in]);
      refreshed++;
    }catch(error){failed++;await mcpPool.query(`update public.connected_accounts set last_error=$2,updated_at=now() where id=$1`,[account.id,String(error instanceof Error?error.message:error).slice(0,300)]);}
  }
  return {refreshed,failed};
}
