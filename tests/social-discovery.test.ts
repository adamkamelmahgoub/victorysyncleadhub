import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoverSocialLinks,resolveAmbiguousSocials } from '../lib/social-discovery.ts';

test('collects public footer and sameAs profiles, without inventing handles', () => {
  const html = '<script type="application/ld+json">{"@type":"Organization","sameAs":["https://instagram.com/acme?utm_source=site"]}</script>' +
    '<footer><a href="https://www.linkedin.com/company/acme/">LinkedIn</a></footer>';
  const links = discoverSocialLinks(html, 'https://acme.example');
  assert.equal(links.length, 2);
  assert.equal(links.find((link) => link.platform === 'instagram')?.confidence, 95);
  assert.equal(links.find((link) => link.platform === 'linkedin_company')?.confidence, 85);
});
test('ambiguous platform candidates require review', () => {
  const links = discoverSocialLinks('<a href="https://instagram.com/a">A</a><a href="https://instagram.com/b">B</a>', 'https://acme.example');
  assert.deepEqual(links.map((link) => link.confidence), [65, 65]);
});
test('free model can only select a discovered candidate',async()=>{
  const previous=process.env.OPENROUTER_API_KEY,original=globalThis.fetch;
  process.env.OPENROUTER_API_KEY='test-key';
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'1'}}]}),{status:200});
  try{const links=discoverSocialLinks('<a href="https://instagram.com/a">A</a><a href="https://instagram.com/b">B</a>','https://acme.example');
    const ranked=await resolveAmbiguousSocials(links,'https://acme.example');
    assert.deepEqual(ranked.map((item)=>item.confidence),[65,72]);
    assert.equal(ranked[1].handle,'b');
  }finally{globalThis.fetch=original;if(previous===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previous;}
});
