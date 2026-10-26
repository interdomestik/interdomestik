import assert from 'node:assert/strict';
// Owner-only diagnostic for the frozen ephemeral SQL fixture, before its unchanged 10 cases.
// Do not print URLs, credentials, query parameters or raw database errors.
export async function assertMinimalOpsGrants(f) {
  const [grants] = await f.admin`select
    has_column_privilege(${f.dataRole}, 'public."user"', 'id', 'SELECT') as id,
    has_column_privilege(${f.dataRole}, 'public."user"', 'role', 'SELECT') as role,
    has_column_privilege(${f.dataRole}, 'public."user"', 'tenant_id', 'SELECT') as tenant,
    has_column_privilege(${f.dataRole}, 'public."user"', 'branch_id', 'SELECT') as branch`;
  assert.deepEqual(grants, {
    id: true,
    role: true,
    tenant: true,
    branch: false,
  });
  const client = f.postgres(f.dataUrl.href, { max: 1, ssl: false });
  let positiveRows = 0,
    denialCode;
  try {
    await assert.rejects(
      client.begin(async tx => {
        await tx`select set_config('app.current_tenant_id', ${f.home}, true),
        set_config('app.current_access_tenant_id', ${f.home}, true)`;
        const rows = await tx`select id, role, tenant_id from "user" where id=${f.actor}`;
        positiveRows = rows.length;
        assert.equal(positiveRows, 1, 'Actual old ops columns remain readable');
        await tx`select branch_id from "user" where id=${f.actor}`;
      }),
      error => {
        denialCode = error?.cause?.code ?? error?.code;
        return denialCode === '42501';
      }
    );
  } finally {
    await client.end({ timeout: 0 });
  }
  return {
    expectedMinimalGrants: true,
    positiveRows,
    forbiddenBranchSelectSqlstate: denialCode,
    roleGrantExpansion: false,
  };
}
