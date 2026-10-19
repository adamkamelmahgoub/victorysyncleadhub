import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { normalizeSocial, type SocialPlatform } from './social-handles.js';

export type SocialCandidate = ReturnType<typeof normalizeSocial> & { confidence: number; source: 'website_scrape'; evidence: 'sameAs' | 'footer' | 'anchor' };
const sites: Array<[RegExp, SocialPlatform]> = [
  [/(^|\.)instagram\.com$/, 'instagram'], [/(^|\.)(facebook|fb)\.com$/, 'facebook'],
  [/(^|\.)linkedin\.com$/, 'linkedin_company'], [/(^|\.)(x|twitter)\.com$/, 'x'],
  [/(^|\.)tiktok\.com$/, 'tiktok'], [/(^|\.)youtube\.com$/, 'youtube'],
  [/(^|\.)threads\.(net|com)$/, 'threads'], [/(^|\.)yelp\.com$/, 'yelp'],
  [/(^|\.)nextdoor\.com$/, 'nextdoor'], [/(^|\.)angi\.com$/, 'angi'],
];

function candidate(link: string, website: string, evidence: SocialCandidate['evidence']): SocialCandidate | null {
  try {
    const url = new URL(link.replace(/&amp;/g, '&'), website);
    const host = url.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
    const match = sites.find(([pattern]) => pattern.test(host));
    if (!match) return null;
    const platform = match[1] === 'linkedin_company' && /^\/in\//i.test(url.pathname) ? 'linkedin_person' : match[1];
    return { ...normalizeSocial(platform, url.toString()), confidence: evidence === 'sameAs' ? 95 : evidence === 'footer' ? 85 : 75,
      source: 'website_scrape', evidence };
  } catch { return null; }
}

export function discoverSocialLinks(html: string, website: string): SocialCandidate[] {
  const found: SocialCandidate[] = [];
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const json = JSON.parse(script[1]);
      const walk = (item: any) => {
        if (!item || typeof item !== 'object') return;
        for (const link of Array.isArray(item.sameAs) ? item.sameAs : item.sameAs ? [item.sameAs] : []) {
          if (typeof link === 'string') { const hit = candidate(link, website, 'sameAs'); if (hit) found.push(hit); }
        }
        for (const child of Object.values(item)) if (typeof child === 'object') {
          if (Array.isArray(child)) child.forEach(walk); else walk(child);
        }
      };
      walk(json);
    } catch { /* A broken JSON-LD block must not hide normal links. */ }
  }
  const footerStart = html.toLowerCase().indexOf('<footer');
  for (const anchor of html.matchAll(/<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>/gi)) {
    const hit = candidate(anchor[2], website, footerStart >= 0 && anchor.index >= footerStart ? 'footer' : 'anchor');
    if (hit) found.push(hit);
  }
  const dedup = new Map<string, SocialCandidate>();
  for (const hit of found) {
    const key = `${hit.platform}:${hit.normalizedHandle}`;
    if (!dedup.has(key) || dedup.get(key)!.confidence < hit.confidence) dedup.set(key, hit);
  }
  const results = [...dedup.values()];
  const counts = new Map<string, number>();
  for (const hit of results) counts.set(hit.platform, (counts.get(hit.platform) || 0) + 1);
  for (const hit of results) if ((counts.get(hit.platform) || 0) > 1) hit.confidence = Math.min(hit.confidence, 65);
  return results;
}

/** AI can select an index from observed URLs; it never supplies a handle. */
export async function resolveAmbiguousSocials(candidates:SocialCandidate[],website:string):Promise<SocialCandidate[]> {
  const key=process.env.OPENROUTER_API_KEY;
  if(!key)return candidates;
  for(const platform of new Set(candidates.map((item)=>item.platform))){
    const options=candidates.filter((item)=>item.platform===platform);
    if(options.length<2)continue;
    try{
      const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',
        headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},signal:AbortSignal.timeout(12000),
        body:JSON.stringify({model:process.env.OPENROUTER_MODEL||'nvidia/nemotron-3.5-lightning:free',temperature:0,max_tokens:12,
          messages:[{role:'system',content:'Choose which observed social profile belongs to the website. Output only the zero-based candidate index, or -1 if uncertain. Never create a new URL or handle.'},
            {role:'user',content:JSON.stringify({website,platform,candidates:options.map((item)=>item.profileUrl)})}]}),
      });
      if(!response.ok)continue;
      const result=await response.json() as {choices?:Array<{message?:{content?:string}}>};
      const answer=result.choices?.[0]?.message?.content?.trim()||'';
      if(!/^-?\d+$/.test(answer))continue;
      const index=Number(answer);
      if(index>=0&&index<options.length)options[index].confidence=Math.max(72,options[index].confidence);
    }catch{/* Keep ambiguous candidates in review when the free model is unavailable. */}
  }
  return candidates;
}

function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a,b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127);
  }
  return isIP(address) === 6 && !/^(::1$|::$|fc|fd|fe80:|::ffff:)/i.test(address);
}

/** Fetch one public homepage only; no login, redirects, or internal network targets. */
export async function discoverWebsiteSocials(input: string): Promise<SocialCandidate[]> {
  const url = new URL(input.startsWith('http') ? input : `https://${input}`);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error('Invalid public website URL');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || isIP(host)) throw new Error('Private website target');
  const addresses = await lookup(host, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) throw new Error('Private website target');
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000),
    headers: { accept: 'text/html', 'user-agent': 'VictorySyncSocialDiscovery/1.0' } });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('No public HTML homepage');
  const html = (await response.text()).slice(0, 1_000_000);
  return discoverSocialLinks(html, url.toString());
}
