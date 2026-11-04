import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  E2E_AGENT_LINK_FIXTURES,
  E2E_CASE_FIXTURES,
  E2E_DOCUMENT_FIXTURES,
  E2E_MESSAGE_FIXTURES,
  E2E_RELATIONSHIP_FIXTURES,
  E2E_ROLE_MATRIX,
  E2E_RUNTIME_ROLES,
  E2E_USER_IDS,
} from '../src/e2e-role-fixtures';
import { E2E_USERS } from '../src/e2e-users';
import { collectRoleCatalogueViolations } from '../src/seed-assert-role-fixtures';
import { buildAgentAssignmentsToSeed } from '../src/seed-golden/agent-assignments';
import { buildClaimsToSeed } from '../src/seed-golden/claims';
import {
  buildRoleRelationshipDocuments,
  buildRoleRelationshipMessages,
} from '../src/seed-golden/role-relationships';
import { buildUsersToSeed } from '../src/seed-golden/users';
import * as schema from '../src/schema';
import { createSeedConfig } from '../src/seed-types';

const here = path.dirname(fileURLToPath(import.meta.url));
const { at } = createSeedConfig('e2e', new Date('2026-01-01T00:00:00Z'));

function runtimeRolesFromSharedAuth(): string[] {
  const source = readFileSync(path.resolve(here, '../../shared-auth/src/permissions.ts'), 'utf8');
  const block = /export const ROLES = \{([\s\S]*?)\} as const;/.exec(source)?.[1] ?? '';
  return [...block.matchAll(/^\s*(\w+):/gm)].map(match => match[1]);
}

test('role catalogue instantiates exactly the nine shared-auth runtime roles', () => {
  assert.deepEqual([...E2E_RUNTIME_ROLES].sort(), runtimeRolesFromSharedAuth().sort());
  assert.deepEqual(Object.keys(E2E_ROLE_MATRIX).sort(), [...E2E_RUNTIME_ROLES].sort());
  assert.deepEqual(collectRoleCatalogueViolations(), []);
});

test('every E2E user has a golden seed row and the platform read roles are seeded', () => {
  const seededIds = new Set(buildUsersToSeed({ at }).map(user => user.id));
  for (const id of Object.values(E2E_USER_IDS)) assert.ok(seededIds.has(id), id);

  const roles = new Set(buildUsersToSeed({ at }).map(user => user.role));
  assert.ok(roles.has('global_support'));
  assert.ok(roles.has('auditor'));
  assert.equal(E2E_USERS.GLOBAL_SUPPORT.tenantId, 'tenant_ks');
  assert.equal(E2E_USERS.AUDITOR.tenantId, 'tenant_mk');
});

test('case fixtures match the golden claims seed exactly', () => {
  const claims = new Map(buildClaimsToSeed({ at, schema }).map(claim => [claim.id, claim]));
  for (const [name, expected] of Object.entries(E2E_CASE_FIXTURES)) {
    const claim = claims.get(expected.id);
    assert.ok(claim, name);
    assert.equal(claim.tenantId, expected.tenantId, `${name}.tenantId`);
    assert.equal(claim.branchId, expected.branchId, `${name}.branchId`);
    assert.equal(claim.userId, expected.ownerUserId, `${name}.userId`);
    assert.equal(claim.agentId ?? null, expected.agentId, `${name}.agentId`);
    assert.equal(claim.staffId ?? null, expected.staffId, `${name}.staffId`);
    assert.ok(claim.createdAt instanceof Date, `${name}.createdAt is pinned to the seed clock`);
  }
});

test('agent link fixtures include an active and an inactive link', () => {
  const links = new Map(buildAgentAssignmentsToSeed().map(link => [link.id, link]));
  for (const [name, expected] of Object.entries(E2E_AGENT_LINK_FIXTURES)) {
    const link = links.get(expected.id);
    assert.ok(link, name);
    assert.equal(`golden_${link.agent}`, expected.agentId, `${name}.agentId`);
    assert.equal(`golden_${link.member}`, expected.memberId, `${name}.memberId`);
    assert.equal(link.tenant, expected.tenantId, `${name}.tenantId`);
    assert.equal(link.status, expected.status, `${name}.status`);
  }
  const otherClientMember = E2E_AGENT_LINK_FIXTURES.PILOT_OTHER_AGENT_CLIENT.memberId;
  assert.ok(
    ![...links.values()].some(
      link =>
        `golden_${link.agent}` === E2E_USER_IDS.PILOT_MK_AGENT &&
        `golden_${link.member}` === otherClientMember
    )
  );
});

test('anchor case messages are deterministic and split public/internal', () => {
  const first = buildRoleRelationshipMessages({ at });
  const second = buildRoleRelationshipMessages({ at });
  assert.deepEqual(first, second);
  assert.deepEqual(
    first.map(message => [message.id, message.claimId, message.isInternal]),
    [
      [E2E_MESSAGE_FIXTURES.KS_ANCHOR_PUBLIC.id, E2E_CASE_FIXTURES.KS_ANCHOR.id, false],
      [E2E_MESSAGE_FIXTURES.KS_ANCHOR_INTERNAL.id, E2E_CASE_FIXTURES.KS_ANCHOR.id, true],
    ]
  );
  assert.equal(first[0].createdAt?.toISOString(), '2025-11-28T00:00:00.000Z');
});

test('every case fixture carries one owner document under its tenant claims prefix', () => {
  const seededClaims = new Map(buildClaimsToSeed({ at, schema }).map(claim => [claim.id, claim]));
  const documents = buildRoleRelationshipDocuments({ at });
  assert.deepEqual(documents, buildRoleRelationshipDocuments({ at }));
  assert.deepEqual(Object.keys(E2E_DOCUMENT_FIXTURES), Object.keys(E2E_CASE_FIXTURES));

  for (const [key, fixture] of Object.entries(E2E_CASE_FIXTURES)) {
    const document = documents.find(row => row.claimId === fixture.id);
    const claim = seededClaims.get(fixture.id);
    assert.ok(document && claim, key);
    assert.equal(document.id, E2E_DOCUMENT_FIXTURES[key as keyof typeof E2E_CASE_FIXTURES].id);
    assert.equal(document.tenantId, claim.tenantId, `${key}.tenantId`);
    assert.equal(document.uploadedBy, claim.userId, `${key}.uploadedBy`);
    assert.ok(
      document.filePath.startsWith(`pii/tenants/${claim.tenantId}/claims/${fixture.id}/`),
      `${key}.filePath`
    );
  }
});

test('relationship fixtures reference catalogued identities', () => {
  for (const [name, fixture] of Object.entries(E2E_RELATIONSHIP_FIXTURES)) {
    assert.ok(fixture.allowedActor in E2E_USERS, `${name}.allowedActor`);
    assert.ok(fixture.deniedActor in E2E_USERS, `${name}.deniedActor`);
  }
});
