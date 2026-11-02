import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiresPortalMfa } from '../api/portal.js';
import {requiresAgencyMfa} from '../lib/portal-roles.js';

test('database agency roles require MFA even when the token carries a legacy role', () => {
  assert.equal(requiresPortalMfa('agency_admin'), true);
  assert.equal(requiresPortalMfa('agency_staff'), true);
  for(const role of ['owner','admin','member','viewer','agent'])
    assert.equal(requiresAgencyMfa(role),true,`${role} must see the MFA gate`);
});

test('client roles do not require agency MFA', () => {
  assert.equal(requiresPortalMfa('client_owner'), false);
  assert.equal(requiresPortalMfa('client_staff'), false);
  assert.equal(requiresAgencyMfa('client'), false);
  assert.equal(requiresPortalMfa('no_access'), false);
});
