import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeSocial } from '../lib/social-handles.ts';

test('normalizes mobile Instagram URLs and tracking query strings', () => {
  assert.deepEqual(normalizeSocial('instagram', 'https://m.instagram.com/Acme/?igsh=abc#bio'), {
    platform: 'instagram', handle: 'Acme', normalizedHandle: 'acme', profileUrl: 'https://www.instagram.com/Acme',
  });
});
test('normalizes LinkedIn company and X legacy domains', () => {
  assert.equal(normalizeSocial('linkedin_company', 'https://linkedin.com/company/Acme/').profileUrl, 'https://www.linkedin.com/company/Acme');
  assert.equal(normalizeSocial('x', 'https://mobile.twitter.com/Acme?ref=foo').profileUrl, 'https://x.com/Acme');
});
test('rejects content links and unrelated domains', () => {
  assert.throws(() => normalizeSocial('instagram', 'https://instagram.com/p/123'));
  assert.throws(() => normalizeSocial('instagram', 'https://evil.example/Acme'));
});
