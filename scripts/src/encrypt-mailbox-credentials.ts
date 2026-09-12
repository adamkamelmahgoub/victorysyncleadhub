import pg from 'pg';
import {encryptCredentials,decryptCredentials,keyring} from '../../lib/email-security.js';
// Run before the Phase 2 migration. Never output secrets or database URLs.
async function main() {
 keyring();if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
 const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
 try {
  await client.query('begin');await client.query('lock table public.email_accounts in exclusive mode');
  const inboxColumn=await client.query("select 1 from information_schema.columns where table_schema='public' and table_name='email_accounts' and column_name='inbound_credentials'");
  const {rows}=await client.query(`select id,from_email,smtp_password${inboxColumn.rowCount?',inbound_credentials':''} from public.email_accounts for update`);let changed=0;
  for(const row of rows) {
   if(row.smtp_password){
    const credentials=row.smtp_password.startsWith('enc:v1:')?decryptCredentials(row.smtp_password,row.from_email):{password:row.smtp_password};
    await client.query('update public.email_accounts set smtp_password=$1 where id=$2',[encryptCredentials(credentials,row.from_email),row.id]);
   }
   if(row.inbound_credentials)await client.query('update public.email_accounts set inbound_credentials=$1 where id=$2',[encryptCredentials(decryptCredentials(row.inbound_credentials,row.from_email),row.from_email),row.id]);
   if(row.smtp_password||row.inbound_credentials)changed++;
  }
  await client.query('commit');console.log(`Encrypted or rotated credentials for ${changed} mailboxes.`);
 } catch {await client.query('rollback');throw new Error('Credential migration failed; no changes were committed. Check the database and encryption-key configuration.');}
 finally {await client.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Credential migration failed');process.exitCode=1;});
