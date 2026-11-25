type ProvisionInput = { adminUrl: string; env: Record<string, string>; role: string };
type RuntimeRoleModule = { provisionE2eRuntimeRole(input: ProvisionInput): Promise<string> };
// The root script is untyped ESM; a non-literal specifier keeps every package's type-check (each
// with its own module settings) from resolving it, and the suite exercises its public contract.
const RUNTIME_ROLE_MODULE: string = '../../../scripts/e2e-runtime-role.mjs';
export const provisionE2eRuntimeRole = async (input: ProvisionInput): Promise<string> =>
  ((await import(RUNTIME_ROLE_MODULE)) as RuntimeRoleModule).provisionE2eRuntimeRole(input);
