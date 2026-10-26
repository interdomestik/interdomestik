// Finite correspondence only. Unlisted source effects remain unresolved.
export const M4_KERNEL_ASSERTION_CASE =
  'expanded runtime retains successful ops assignment response and atomic audit ledger';
export const M4_KERNEL_ASSERTION_FILE = 'db-access-m4-runtime-fixture-profiles-1.mjs';
// Independent finite oracle program: the assertion values must come from the
// actual runtime invocation and parent state reads, not fabricated look-alikes.
export const M4_KERNEL_ASSERTION_PROGRAM = `async () => {
  const id = 'profile_ops_' + suffix;
  await seedClaim(id);
  const r = { ...req(id), command: 'm4.ops.assign-owner' };
  const result = await runtime.execute(cookie, JSON.stringify(r));
  assert.equal(result.status, 'completed');
  assert.equal(result.result.success, true);
  assert.equal(result.result.data.id, id);
  assert.equal(result.result.data.staffId, staff);
  assert.equal(typeof result.result.data.assignedAt, 'string');
  assert.equal(result.changed, undefined);
  const after = await state(id);
  assert.equal(after.audit.length, 1);
  assert.equal(after.result.length, 1);
  assert.equal(after.claim[0].staffId, staff);
  await drain();
  assert.equal((await notification(r)).length, 0);
}`;
export const M4_KERNEL_ASSERTION_LINKS = Object.freeze([
  Object.freeze({
    step: 'update-claim-assignment',
    assertions: Object.freeze([
      'assert.equal(after.claim[0].staffId, staff)',
      'assert.equal(result.result.data.staffId, staff)',
      "assert.equal(typeof result.result.data.assignedAt, 'string')",
    ]),
    scope:
      'Successful assignment and returned assignment timestamp; conflict/tenant/lifetime premises remain separate.',
  }),
  Object.freeze({
    step: 'insert-audit',
    assertions: Object.freeze(['assert.equal(after.audit.length, 1)']),
    scope:
      'Successful audit insertion; full audit payload and audit-failure rollback are not inferred.',
  }),
  Object.freeze({
    step: 'return-success',
    assertions: Object.freeze([
      'assert.equal(result.result.success, true)',
      'assert.equal(result.result.data.id, id)',
    ]),
    scope: 'Successful kernel result; denial branches remain unresolved.',
  }),
]);
