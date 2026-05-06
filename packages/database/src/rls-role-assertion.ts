/**
 * Verifies only the RLS connection and optional configured SET ROLE target.
 * The admin connection is intentionally privileged and may bypass RLS by design;
 * do not extend this assertion to dbAdmin.
 */
export type RlsConnectionRolePosture = {
  currentUser: string | null;
  roleName?: string | null;
  roleBypassesRls: boolean | null;
  roleIsSuperuser: boolean | null;
};

export type RlsConnectionRoleAssertionOptions = {
  isProduction: boolean;
  configuredDbRole?: string | null;
  queryRolePosture: (roleName?: string) => Promise<RlsConnectionRolePosture[]>;
  timeoutMs?: number;
};

export type RlsConnectionRoleAssertionResult =
  | {
      ok: true;
      currentUser: string;
      configuredDbRole?: string;
      roleBypassesRls: false;
      roleIsSuperuser: false;
    }
  | {
      ok: false;
      reason:
        | 'invalid_configured_role'
        | 'missing_role_posture'
        | 'role_bypasses_rls'
        | 'query_failed';
      checkedRole?: 'connection' | 'configuredDbRole';
      currentUser?: string;
      configuredDbRole?: string;
      cause?: unknown;
    };

export class RlsConnectionRoleAssertionError extends Error {
  readonly result: RlsConnectionRoleAssertionResult;

  constructor(result: RlsConnectionRoleAssertionResult) {
    super(formatRlsConnectionRoleAssertionFailure(result));
    this.name = 'RlsConnectionRoleAssertionError';
    this.result = result;
  }
}

export function evaluateRlsConnectionRolePosture(
  rows: RlsConnectionRolePosture[],
  checkedRole: 'connection' | 'configuredDbRole' = 'connection',
  expectedRoleName?: string
): RlsConnectionRoleAssertionResult {
  const posture = rows[0];
  const currentUser =
    expectedRoleName ?? posture?.roleName?.trim() ?? posture?.currentUser?.trim() ?? undefined;

  if (
    !currentUser ||
    typeof posture?.roleBypassesRls !== 'boolean' ||
    typeof posture?.roleIsSuperuser !== 'boolean'
  ) {
    return {
      ok: false,
      reason: 'missing_role_posture',
      checkedRole,
      currentUser,
    };
  }

  if (posture.roleBypassesRls || posture.roleIsSuperuser) {
    return {
      ok: false,
      reason: 'role_bypasses_rls',
      checkedRole,
      currentUser,
    };
  }

  return {
    ok: true,
    currentUser,
    roleBypassesRls: false,
    roleIsSuperuser: false,
  };
}

export function formatRlsConnectionRoleAssertionFailure(
  result: RlsConnectionRoleAssertionResult
): string {
  if (result.ok) {
    return `DATABASE_URL_RLS role ${result.currentUser} cannot bypass RLS`;
  }

  if (result.reason === 'role_bypasses_rls') {
    const label = result.checkedRole === 'configuredDbRole' ? 'DB_RLS_ROLE target' : 'role';
    return `DATABASE_URL_RLS ${label} ${result.currentUser ?? 'unknown'} can bypass row-level security; refusing startup`;
  }

  if (result.reason === 'invalid_configured_role') {
    return `DB_RLS_ROLE contains an invalid PostgreSQL role identifier; refusing startup`;
  }

  if (result.reason === 'query_failed') {
    return `DATABASE_URL_RLS role posture could not be verified; refusing startup`;
  }

  return `DATABASE_URL_RLS role posture was missing or malformed; refusing startup`;
}

export function assertRlsRoleIdentifier(role: string): string {
  const normalized = role.trim();
  if (!/^[a-zA-Z_]\w*$/u.test(normalized)) {
    throw new Error(`Invalid DB role for RLS context: ${role}`);
  }
  return normalized;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`DATABASE_URL_RLS role posture query timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function handleNonOkRoleAssertionResult(
  result: RlsConnectionRoleAssertionResult,
  isProduction: boolean
): RlsConnectionRoleAssertionResult {
  if (isProduction) {
    throw new RlsConnectionRoleAssertionError(result);
  }

  return result;
}

function getConfiguredDbRole(
  configuredDbRole: string | null | undefined,
  isProduction: boolean
): string | RlsConnectionRoleAssertionResult | undefined {
  if (!configuredDbRole?.trim()) {
    return undefined;
  }

  try {
    return assertRlsRoleIdentifier(configuredDbRole);
  } catch (cause) {
    return handleNonOkRoleAssertionResult(
      {
        ok: false,
        reason: 'invalid_configured_role',
        configuredDbRole,
        cause,
      },
      isProduction
    );
  }
}

async function evaluateQueriedRolePosture(
  options: RlsConnectionRoleAssertionOptions,
  roleName: string | undefined,
  checkedRole: 'connection' | 'configuredDbRole'
): Promise<RlsConnectionRoleAssertionResult> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const rows = await withTimeout(options.queryRolePosture(roleName), timeoutMs);
  const result = evaluateRlsConnectionRolePosture(rows, checkedRole, roleName);

  if (!result.ok && checkedRole === 'configuredDbRole') {
    result.configuredDbRole = roleName;
  }

  return result;
}

export async function assertRlsConnectionRole(
  options: RlsConnectionRoleAssertionOptions
): Promise<RlsConnectionRoleAssertionResult> {
  const configuredDbRole = getConfiguredDbRole(options.configuredDbRole, options.isProduction);
  if (typeof configuredDbRole === 'object') {
    return configuredDbRole;
  }

  try {
    const connectionResult = await evaluateQueriedRolePosture(options, undefined, 'connection');
    if (!connectionResult.ok) {
      return handleNonOkRoleAssertionResult(connectionResult, options.isProduction);
    }

    if (!configuredDbRole) {
      return connectionResult;
    }

    const configuredRoleResult = await evaluateQueriedRolePosture(
      options,
      configuredDbRole,
      'configuredDbRole'
    );
    if (!configuredRoleResult.ok) {
      return handleNonOkRoleAssertionResult(configuredRoleResult, options.isProduction);
    }

    return {
      ...connectionResult,
      configuredDbRole,
    };
  } catch (cause) {
    if (cause instanceof RlsConnectionRoleAssertionError) {
      throw cause;
    }

    const result: RlsConnectionRoleAssertionResult = {
      ok: false,
      reason: 'query_failed',
      cause,
    };
    if (options.isProduction) {
      throw new RlsConnectionRoleAssertionError(result);
    }
    return result;
  }
}
