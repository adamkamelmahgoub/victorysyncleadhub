import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../artifacts/leadgen/dist/public/',import.meta.url));
const names=[
  'SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SERVICE_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET',
  'OPENROUTER_API_KEY','MIGHTYCALL_API_KEY','MIGHTYCALL_SECRET_KEY','MIGHTYCALL_USER_KEY',
  'MIGHTYCALL_WEBHOOK_SECRET','RESEND_API_KEY','SLACK_WEBHOOK_URL','OUTREACH_WORKER_TOKEN',
  'CLIENT_DELIVERY_WORKER_SECRET','CRON_SECRET','PORTAL_COOKIE_SECRET','UNIPILE_API_KEY',
];
const values=names.flatMap(name=>{
  const value=process.env[name];
  return value&&value.length>=12?[{name,value}]:[];
});
let inspected=0;
async function inspect(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const path=join(directory,entry.name);
    if(entry.isDirectory()){await inspect(path);continue;}
    if(!/\.(?:js|css|html|json)$/.test(entry.name))continue;
    const content=await readFile(path,'utf8');inspected++;
    for(const name of names)if(content.includes(name))throw new Error(`Browser artifact contains server-only variable name ${name}: ${path}`);
    for(const {name,value} of values)if(content.includes(value))throw new Error(`Browser artifact contains value of ${name}: ${path}`);
  }
}
await inspect(root);
console.log(`Scanned ${inspected} browser artifacts for server-only credentials.`);
