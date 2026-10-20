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
