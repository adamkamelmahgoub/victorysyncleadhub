import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { normalizeSocial } from '../lib/social-handles.ts';
let pg;
try { pg = createRequire(import.meta.url)('pg'); }
catch { pg = createRequire(path.join(process.env.TEMP || '', 'victorysync-social-audit', 'package.json'))('pg'); }
const line = fs.readFileSync('.env', 'utf8').split(/\r?\n/).find((value) => value.startsWith('DATABASE_URL='));
if (!line) throw new Error('DATABASE_URL is missing');
const client = new pg.Client({ connectionString: line.slice(13).replace(/^"|"$/g, ''), connectionTimeoutMillis: 5000 });
const apply = process.argv.includes('--apply');
const defaultOrg = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
const keyPlatforms = { instagram:'instagram', ig:'instagram', facebook:'facebook', fb:'facebook',
  linkedin:'linkedin', linkedin_url:'linkedin', x:'x', twitter:'x', tiktok:'tiktok', youtube:'youtube',
  threads:'threads', whatsapp:'whatsapp', yelp:'yelp', nextdoor:'nextdoor', angi:'angi' };
const sources = [
  { table:'leads', type:'lead', org:'organization_id', payload:true },
  { table:'crm_contacts', type:'contact', org:'organization_id', payload:false },
  { table:'crm_companies', type:'company', org:'organization_id', payload:false },
  { table:'companies', type:'company', org:null, payload:false },
];
try {
  await client.connect();
  let candidates = 0, invalid = 0, inserted = 0;
  if (apply) await client.query('begin');
  for (const source of sources) {
    const columns = `id,custom_fields${source.org ? `,${source.org}` : ''}${source.payload ? ',raw_payload' : ''}`;
    const rows = await client.query(`select ${columns} from public.${source.table}`);
    for (const row of rows.rows) {
      const bags = [['custom_fields',row.custom_fields], ['raw_payload',row.raw_payload]];
      for (const [bagName,bag] of bags) {
        if (!bag || typeof bag !== 'object') continue;
        for (const [key, platformKey] of Object.entries(keyPlatforms)) {
          const value = bag[key];
          if (typeof value !== 'string' || !value.trim()) continue;
          const platform = platformKey === 'linkedin' ? source.type === 'company' ? 'linkedin_company' : 'linkedin_person' : platformKey;
          try {
            const normalized = normalizeSocial(platform, value);
            candidates++;
            if (apply) {
              const result = await client.query(`insert into public.social_profiles
                (organization_id,entity_type,entity_id,platform,handle,normalized_handle,profile_url,is_primary,confidence,source)
                values($1,$2,$3,$4,$5,$6,$7,$8,$9,'import') on conflict do nothing returning id`,
                [row[source.org] || defaultOrg,source.type,row.id,platform,normalized.handle,normalized.normalizedHandle,
                  normalized.profileUrl,bagName === 'custom_fields',bagName === 'custom_fields' ? 80 : 60]);
              inserted += result.rowCount;
            }
          } catch { invalid++; }
        }
      }
    }
  }
  if (apply) await client.query('commit');
  console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry_run', candidates, invalid, inserted }));
} catch (error) {
  if (apply) await client.query('rollback').catch(() => {});
  throw error;
} finally { await client.end().catch(() => {}); }
