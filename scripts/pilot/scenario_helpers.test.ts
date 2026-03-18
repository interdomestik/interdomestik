import assert from 'node:assert/strict';
import test from 'node:test';

import { selectPilotOperators } from './scenario_helpers';

test('selectPilotOperators prefers users from the requested tenant', () => {
  const selected = selectPilotOperators(
    [
      { id: 'mk-agent', email: 'agent.ks.a1@interdomestik.com', tenantId: 'tenant_mk' },
      { id: 'ks-agent', email: 'agent.ks.a1@interdomestik.com', tenantId: 'tenant_ks' },
      { id: 'mk-member', email: 'member.ks.a1@interdomestik.com', tenantId: 'tenant_mk' },
      { id: 'ks-member', email: 'member.ks.a1@interdomestik.com', tenantId: 'tenant_ks' },
      { id: 'mk-staff', email: 'staff.ks.extra@interdomestik.com', tenantId: 'tenant_mk' },
      { id: 'ks-staff', email: 'staff.ks.extra@interdomestik.com', tenantId: 'tenant_ks' },
    ],
    'tenant_ks'
  );

  assert.deepEqual(selected, {
    agentId: 'ks-agent',
    memberId: 'ks-member',
    staffId: 'ks-staff',
  });
});
