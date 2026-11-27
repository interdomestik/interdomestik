import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';

export async function assertRequestTenantIsolation(
  rls: postgres.Sql,
  claimId: string,
  foreignClaim: string,
  staff: string
) {
  assert.equal(
    (await rls`select id from claim_information_requests where claim_id = ${claimId}`).length,
    0,
    'missing tenant context fails closed'
  );
  await rls.begin(async tx => {
    await tx`select set_config('app.current_tenant_id', 'tenant_mk', true)`;
    assert.equal(
      (await tx`select id from claim_information_requests where claim_id = ${claimId}`).length,
      0
    );
    assert.equal(
      (
        await tx`update claim_information_requests set requested_information = 'leak' where claim_id = ${claimId} returning id`
      ).length,
      0
    );
    assert.equal(
      (await tx`delete from claim_information_requests where claim_id = ${claimId} returning id`)
        .length,
      0
    );
  });
  await assert.rejects(
    rls.begin(async tx => {
      await tx`select set_config('app.current_tenant_id', 'tenant_ks', true)`;
      await tx`insert into claim_information_requests (tenant_id, claim_id, correlation_id, requested_information, explanation_for_member, due_at, responsible_staff_id, created_by_staff_id, sla_posture)
        values ('tenant_ks', ${foreignClaim}, ${randomUUID()}, 'Forbidden', 'Forbidden', now(), ${staff}, ${staff}, 'incomplete')`;
    }),
    /row-level security/
  );
}
