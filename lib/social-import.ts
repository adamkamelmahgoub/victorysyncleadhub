import {normalizeSocial,type SocialPlatform} from './social-handles.js';

export const SOCIAL_CSV_FIELDS=[
  {key:'instagram',label:'Instagram',aliases:['instagram','ig']},
  {key:'facebook',label:'Facebook',aliases:['facebook','fb']},
  {key:'linkedin',label:'LinkedIn',aliases:['linkedin','linked_in']},
  {key:'x',label:'X / Twitter',aliases:['x','twitter']},
  {key:'tiktok',label:'TikTok',aliases:['tiktok','tik_tok']},
  {key:'website',label:'Website',aliases:['website','site','web_url']},
] as const;
export function importedSocials(fields:Record<string,unknown>){
  const results:Array<ReturnType<typeof normalizeSocial>>=[];
  const lower=Object.fromEntries(Object.entries(fields).map(([key,value])=>[key.toLowerCase().replace(/[^a-z0-9]/g,''),value]));
  for(const field of SOCIAL_CSV_FIELDS){
    if(field.key==='website')continue;
    const raw=field.aliases.map(alias=>lower[alias.replace(/[^a-z0-9]/g,'')]).find(value=>typeof value==='string'&&value.trim());
    if(!raw)continue;
    let platform:SocialPlatform=field.key==='linkedin'?'linkedin_person':field.key;
    if(field.key==='linkedin'&&String(raw).includes('/company/'))platform='linkedin_company';
    results.push(normalizeSocial(platform,String(raw)));
  }
  return results;
}
