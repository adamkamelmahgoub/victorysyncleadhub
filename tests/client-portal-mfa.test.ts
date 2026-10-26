import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiresPortalMfa } from '../api/portal.js';

test('legacy agency roles retain portal access without new MFA enrollment', () => {
  assert.equal(requiresPortalMfa('agency_admin','admin'), false);
  assert.equal(requiresPortalMfa('agency_admin','owner'), false);
  assert.equal(requiresPortalMfa('agency_staff','member'), false);
});

test('new agency roles still require two-step verification', () => {
  assert.equal(requiresPortalMfa('agency_admin','agency_admin'), true);
  assert.equal(requiresPortalMfa('agency_staff','agency_staff'), true);
  assert.equal(requiresPortalMfa('client_owner','client_owner'), false);
});
