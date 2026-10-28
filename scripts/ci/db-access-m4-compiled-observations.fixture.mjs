// Synthetic pure-comparison data, never real execution evidence or a provenance handle.
import { compiledDigest as hash } from './db-access-m4-compiled-observations.mjs';
export function comparisonFixture() {
  const profiles = ['legacy-admin', 'legacy-agent', 'staff'];
  const cases = profiles.map((profile, i) => ({
    profile,
    claimId: 'claim' + i,
    actorId: i === 2 ? 'staff-self' : 'actor',
    tenantId: 'tenant',
    staffId: i === 2 ? 'staff-self' : 'staff',
  }));
  const actionMap = { a: 'runAdminAssignment', b: 'runAgentAssignment', c: 'runStaffAssignment' };
  const browser = { version: 1, complete: true, rows: [] };
  const owner = {
    version: 1,
    localQualificationOnly: false,
    loopbackQualification: false,
    constructorName: 'startM4PrivateAssignmentOwner',
    contexts: {
      version: 1,
      localQualificationOnly: false,
      loopbackQualification: false,
      constructorName: 'createM4PrivateAssignmentRuntime',
      rows: [],
    },
    transport: { rows: [] },
  };
  const sql = [];
  for (let i = 0; i < 4; i++) {
    const denial = i === 3,
      expected = cases[denial ? 0 : i],
      profile = expected.profile;
    const operationId = '00000000-0000-4000-8000-00000000000' + i;
    const row = {
      profile,
      claimId: expected.claimId,
      operationId,
      frameworkActionId: denial ? 'a' : ['a', 'b', 'c'][i],
      firstCacheToken: 'before' + i,
      refreshedCacheToken: denial ? 'before' + i : 'after' + i,
      warmHit: true,
      ...(denial ? {} : { refreshedHit: true }),
      browserResult: {
        outcome: 'settled',
        operationId,
        result: denial ? { success: false, error: 'Unauthorized' } : { success: true },
      },
    };
    if (denial) browser.denial = row;
    else browser.rows.push(row);
    const command = profile === 'staff' ? 'm4.staff.assign-claim' : 'm4.legacy.assign-claim';
    const requestDigest = hash({
      version: 1,
      command,
      operationId,
      claimId: expected.claimId,
      ...(profile === 'staff' ? {} : { staffId: expected.staffId }),
    });
    const responseDigest = hash(
      denial
        ? { status: 'denied', reason: 'UNAUTHORIZED' }
        : {
            status: 'completed',
            operationId,
            replayed: false,
            result: { success: true },
            changed: true,
          }
    );
    owner.transport.rows.push({
      profile,
      path: '/m4/assignment/' + profile,
      operationId,
      requestDigest,
      responseDigest,
      outcome: denial ? 'denied' : 'completed',
      delivery: 'finished',
    });
    owner.contexts.rows.push({
      ordinal: i + 1,
      profile,
      receiver: 'posture-checked-owned-data-drizzle',
      verifier: 'owned-current-store-identity-drizzle',
      configurationIdentityChecked: true,
      capturedAfterPosture: true,
      operationId,
      requestDigest,
      responseDigest,
    });
    if (!denial)
      sql.push({
        claim: [{ id: expected.claimId, tenant_id: expected.tenantId, staffId: expected.staffId }],
        target: [
          {
            id: expected.staffId,
            role: 'staff',
            tenant_id: expected.tenantId,
            emailVerified: false,
          },
        ],
        audit: [
          {
            actor_id: expected.actorId,
            actor_role: profile === 'staff' ? 'staff' : 'admin',
            tenant_id: expected.tenantId,
            entity_id: expected.claimId,
            entity_type: 'claim',
            action: 'claim.assigned',
            metadata: {
              previousStaffId: null,
              newStaffId: expected.staffId,
              requestObservation: { provenance: 'web-relay-reported', authoritative: false },
            },
          },
        ],
        result: [
          {
            operation_id: operationId,
            tenant_id: expected.tenantId,
            actor_id: expected.actorId,
            claim_id: expected.claimId,
            command,
            version: 1,
            request_fingerprint: hash([
              1,
              command,
              expected.actorId,
              expected.tenantId,
              expected.claimId,
              expected.staffId,
              profile,
            ]),
            response: { result: { success: true }, changed: true },
          },
        ],
        notifications:
          profile === 'staff'
            ? []
            : [
                {
                  id: 'ntf_m4_assignment_' + operationId,
                  tenant_id: expected.tenantId,
                  user_id: expected.staffId,
                  type: 'claim_assigned',
                  action_url: '/staff/claims/' + expected.claimId,
                },
              ],
      });
  }
  return { cases, browser, owner, actionMap, sql, denialSql: { ledger: [], audit: [] } };
}
