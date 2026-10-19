import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoverSocialLinks } from '../lib/social-discovery.ts';

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
