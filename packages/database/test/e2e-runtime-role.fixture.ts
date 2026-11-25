import { randomBytes } from 'node:crypto';
import type postgres from 'postgres';

import { quoteIdentifier } from './rls-test-connection';

type ProvisionInput = { adminUrl: string; env: Record<string, string>; role: string };
type RuntimeRoleModule = { provisionE2eRuntimeRole(input: ProvisionInput): Promise<string> };
type RuntimeGrantsModule = {
  grantE2eRuntimePrivileges(tx: postgres.TransactionSql, quotedRole: string): Promise<void>;
};
// The root scripts are untyped ESM. Non-literal specifiers keep package type-checks from
// resolving them. The suites exercise their contracts.
const RUNTIME_ROLE_MODULE: string = '../../../scripts/e2e-runtime-role.mjs';
const RUNTIME_GRANTS_MODULE: string = '../../../scripts/e2e-runtime-role-grants.mjs';
export const provisionE2eRuntimeRole = async (input: ProvisionInput): Promise<string> =>
  ((await import(RUNTIME_ROLE_MODULE)) as RuntimeRoleModule).provisionE2eRuntimeRole(input);

export async function withE2eRuntimeGrants(
  admin: postgres.Sql,
  run: (roleName: string) => Promise<void>
) {
  const { grantE2eRuntimePrivileges } = (await import(
    RUNTIME_GRANTS_MODULE
  )) as RuntimeGrantsModule;
  const roleName = `interdomestik_e2e_runtime_${randomBytes(6).toString('hex')}`;
  const role = quoteIdentifier(roleName);
  await admin.unsafe(`create role ${role} nologin noinherit nosuperuser nobypassrls`);
  try {
    await admin.begin(async tx => {
      await tx.unsafe(`grant usage on schema public to ${role}`);
      await grantE2eRuntimePrivileges(tx, role);
    });
    await run(roleName);
  } finally {
    await admin.unsafe(`drop owned by ${role}`);
    await admin.unsafe(`drop role ${role}`);
  }
}
