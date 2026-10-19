import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { encryptToken, decryptToken } from '../lib/social-crypto.ts';

test('token encryption is authenticated and nondeterministic', () => {
  const previous = process.env.TOKEN_ENCRYPTION_KEY;
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  try {
    const a = encryptToken('example-token');
    const b = encryptToken('example-token');
    assert.notEqual(a,b);
    assert.equal(decryptToken(a),'example-token');
    assert.throws(()=>decryptToken(a.slice(0,-1)+'A'));
  } finally { if (previous === undefined) delete process.env.TOKEN_ENCRYPTION_KEY; else process.env.TOKEN_ENCRYPTION_KEY = previous; }
});
