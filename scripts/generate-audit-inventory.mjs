// Read-only metadata inventory. Set DATABASE_URL to a schema-access connection string.
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,relative} from 'node:path';
import pg from 'pg';

const root=new URL('../',import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,'');
const walk=dir=>{try{return readdirSync(join(root,dir),{withFileTypes:true}).flatMap(entry=>{
  const name=join(dir,entry.name);return entry.isDirectory()?walk(name):[name];
})}catch{return []}};
const source=[...walk('api'),...walk('artifacts/leadgen/src'),...walk('artifacts/api-server/src'),
  ...walk('lib'),...walk('scripts'),...walk('supabase/functions')]
  .filter(file=>/\.(ts|tsx|js|mjs)$/.test(file)&&!/\/dist\//.test(file.replaceAll('\\','/')));
const contents=source.map(file=>({file:file.replaceAll('\\','/'),text:readFileSync(join(root,file),'utf8')}));
const app=contents.find(x=>x.file==='artifacts/leadgen/src/App.tsx')?.text||'';
const pages=[...app.matchAll(/<Route\s+path="([^"]+)"/g)].map(x=>x[1]);
const apiFiles=walk('api').filter(x=>x.endsWith('.ts')&&!x.endsWith('tsconfig.json'));
const serverRoutes=contents.filter(x=>x.file.startsWith('artifacts/api-server/src/')).flatMap(x=>
  [...x.text.matchAll(/(?:app|router)\.(get|post|put|patch|delete)\(\s*[`'"]([^`'"]+)/g)]
    .map(m=>({method:m[1].toUpperCase(),path:m[2],file:x.file})));
const env=[...new Set(contents.flatMap(x=>[...x.text.matchAll(/(?:process|import\.meta)\.env\.([A-Z][A-Z0-9_]*)/g)].map(m=>m[1])))].sort();
const workers=[...new Set([...walk('supabase/functions').filter(x=>/index\.ts$/.test(x)),
  ...apiFiles.filter(x=>/worker|webhook/.test(x))])].sort();
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
await client.connect();
let tables,cron;
try {
  tables=(await client.query(`select c.relname as name,c.relrowsecurity as rls,
    coalesce((select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod)) order by a.attnum)
      from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'[]'::jsonb) columns,
    coalesce((select jsonb_agg(jsonb_build_object('name',p.policyname,'command',p.cmd,'roles',p.roles,'using',p.qual,'check',p.with_check) order by p.policyname)
      from pg_policies p where p.schemaname='public' and p.tablename=c.relname),'[]'::jsonb) policies
    from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') order by c.relname`)).rows;
  cron=(await client.query('select jobname,schedule,active from cron.job order by jobname')).rows;
} finally {await client.end()}
const dir=join(root,'qa','audit');mkdirSync(dir,{recursive:true});
writeFileSync(join(dir,'schema-metadata.json'),JSON.stringify({capturedAt:new Date().toISOString(),tables,cron},null,2)+'\n');
const lines=['# Phase 0 inventory','','Generated from the current source tree and read-only production schema metadata. No customer rows or secret values were read. Route auth flags below are source-scan prompts for review, not security verdicts.','',
  `## Pages (${pages.length} routes)`,'',...pages.map(p=>`- \`${p}\``),'',
  `## Vercel API entry points (${apiFiles.length})`,'',...apiFiles.map(file=>{
    const code=readFileSync(join(root,file),'utf8');
    const auth=/authenticate\(|auth\.getUser|verifyJwt|requireAuth|requireUser|assertAuth|authUser|mcpAuth/i.test(code);
    return `- \`${file.replaceAll('\\','/')}\` | auth marker: ${auth?'present':'review required'}`;
  }),'',`## API server routes (${serverRoutes.length})`,'',
  ...serverRoutes.map(r=>`- ${r.method} \`${r.path}\` | \`${r.file}\``),'',
  `## Public tables (${tables.length})`,'',
  '| Table | RLS | Columns | Policies |','| --- | --- | --- | --- |',
  ...tables.map(t=>`| \`${t.name}\` | ${t.rls?'on':'**OFF**'} | ${t.columns.map(c=>`\`${c.name}\` ${c.type}`).join(', ')} | ${t.policies.map(p=>`\`${p.name}\` (${p.command})`).join(', ')||'none'} |`),'',
  'Full policy expressions are in [schema-metadata.json](schema-metadata.json).','',
  `## Cron jobs (${cron.length})`,'',...cron.map(j=>`- \`${j.jobname}\`: \`${j.schedule}\`, ${j.active?'active':'inactive'}`),'',
  `## Workers and webhook handlers (${workers.length})`,'',...workers.map(x=>`- \`${x.replaceAll('\\','/')}\``),'',
  `## Environment variables referenced in code (${env.length})`,'',...env.map(x=>`- \`${x}\``),'',
  '## Duplication candidates for investigation','','- `landing_pages` and `marketing_landing_pages`: legacy archive and current writable page model.','- `org_members`, `org_users`, `memberships`, and `team_members`: overlapping membership models.','- `clients`, `vs_clients`, and `sub_accounts`: inspect references before consolidation.','- `company_tasks` and `contact_tasks`: separate task models with different UI readers.',''];
writeFileSync(join(root,'AUDIT_INVENTORY.md'),lines.join('\n'));
console.log(JSON.stringify({pages:pages.length,apiFiles:apiFiles.length,serverRoutes:serverRoutes.length,tables:tables.length,rlsDisabled:tables.filter(x=>!x.rls).map(x=>x.name),cron:cron.length,env:env.length}));
