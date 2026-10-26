import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAccessPath } from '../artifacts/leadgen/src/lib/permissions.js';

test('client staff routes stay within their allowed portal pages', () => {
  assert.equal(canAccessPath('/client-portal/leads', ['dashboard','leads','calls'], 'client_staff'), true);
  assert.equal(canAccessPath('/client-portal/billing', ['dashboard','leads','calls'], 'client_staff'), false);
  assert.equal(canAccessPath('/leads', ['dashboard','leads','calls'], 'client_staff'), false);
});

test('agency staff cannot open client billing', () => {
  assert.equal(canAccessPath('/client-portal/billing', null, 'agency_staff'), false);
  assert.equal(canAccessPath('/client-portal/pages', ['dashboard','pages'], 'agency_staff'), true);
  assert.equal(canAccessPath('/client-portal/reviews', ['dashboard','pages'], 'agency_staff'), false);
});

test('legacy admin permissions do not block the portal dashboard', () => {
  assert.equal(canAccessPath('/client-portal', ['forms', 'settings'], 'admin'), true);
  assert.equal(canAccessPath('/client-portal/dashboard', ['forms', 'settings'], 'admin'), true);
  assert.equal(canAccessPath('/client-portal/billing', ['forms', 'settings'], 'member'), false);
});
