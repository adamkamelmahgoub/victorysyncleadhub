import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPortalLink } from '../lib/client-portal-link.js';

test('owner alerts link to the configured client portal', () => {
  assert.equal(clientPortalLink('leads', 'https://portal.victorysync.com', 'https://app.victorysync.com'),
    'https://portal.victorysync.com/client-portal/leads');
  assert.equal(clientPortalLink('calls', 'https://portal.victorysync.com/', 'https://app.victorysync.com'),
    'https://portal.victorysync.com/client-portal/calls');
});

test('invalid portal origins cannot redirect alerts away from the app', () => {
  assert.equal(clientPortalLink('leads', 'javascript:alert(1)', 'https://app.victorysync.com'),
    'https://app.victorysync.com/client-portal/leads');
  assert.equal(clientPortalLink('calls', 'https://portal.victorysync.com@evil.example', undefined),
    'https://app.victorysync.com/client-portal/calls');
});
