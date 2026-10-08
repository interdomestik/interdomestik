import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// The fixture registers module mocks, so it must be imported before the subject.
// tenant-front-door is intentionally not mocked: admission uses the real IDA classifier.
import {
  hoisted,
  mockSelectChains,
  resetOpsClaimDetailMocks,
} from './getOpsClaimDetail.test-fixtures';
import { getOpsClaimDetail } from './getOpsClaimDetail';

const ENV_KEYS = ['IDA_HOST', 'NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_URL', 'VERCEL_URL'] as const;
const originalHostEnv = new Map<string, string | undefined>();

function requestFrom(host: string, forwardedHost?: string): void {
  const entries: Array<[string, string]> = [['host', host]];
  if (forwardedHost) entries.push(['x-forwarded-host', forwardedHost]);
  hoisted.headersFn.mockResolvedValueOnce(new Headers(entries));
}

function signInAs(user: { role: string; branchId?: string }): void {
  hoisted.getSession.mockResolvedValueOnce({
    user: { id: `${user.role}-1`, tenantId: 'tenant_ks', ...user },
  });
}

function expectDeniedBeforeSql(result: unknown): void {
  expect(result).toEqual({ kind: 'not_found' });
  expect(hoisted.claimsFindFirst).not.toHaveBeenCalled();
  expect(hoisted.withTenantContext).not.toHaveBeenCalled();
}

function expectAccessThenHomeTenantReads(): void {
  expect(hoisted.withTenantContext.mock.calls.map(call => call[0])).toEqual([
    expect.objectContaining({ tenantId: 'tenant_ks' }),
    expect.objectContaining({ tenantId: 'tenant_home' }),
  ]);
  expect(hoisted.matchesAccessTenant).toHaveBeenCalledWith(expect.anything(), 'tenant_ks');
}

describe('getOpsClaimDetail host admission', () => {
  beforeEach(() => {
    resetOpsClaimDetailMocks();
    for (const key of ENV_KEYS) {
      originalHostEnv.set(key, process.env[key]);
      Reflect.deleteProperty(process.env, key);
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalHostEnv.get(key);
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
    originalHostEnv.clear();
  });

  it('denies the staging host before SQL when IDA_HOST is not configured', async () => {
    requestFrom('staging.interdomestik.com');

    expectDeniedBeforeSql(await getOpsClaimDetail('claim-1'));
  });

  it('admits the configured IDA_HOST without deployment URL envs', async () => {
    process.env.IDA_HOST = 'staging.interdomestik.com';
    requestFrom('staging.interdomestik.com');
    mockSelectChains();

    const result = await getOpsClaimDetail('claim-1');

    expect(result.kind).toBe('ok');
    expectAccessThenHomeTenantReads();
  });

  it.each(['ida.interdomestik.com', 'interdomestik-web.vercel.app'])(
    'admits the known unscoped host %s under the session access tenant',
    async host => {
      requestFrom(host);
      mockSelectChains();

      const result = await getOpsClaimDetail('claim-1');

      expect(result.kind).toBe('ok');
      expectAccessThenHomeTenantReads();
    }
  );

  it('denies an unknown host before SQL even when IDA_HOST is configured', async () => {
    process.env.IDA_HOST = 'staging.interdomestik.com';
    requestFrom('attacker.invalid');

    expectDeniedBeforeSql(await getOpsClaimDetail('claim-1'));
  });

  it('keeps forwarded-host priority over an IDA host header', async () => {
    requestFrom('ida.interdomestik.com', 'attacker.invalid');

    expectDeniedBeforeSql(await getOpsClaimDetail('claim-1'));
  });

  it('keeps recognized country mismatch denial ahead of IDA admission', async () => {
    process.env.IDA_HOST = 'mk.localhost';
    requestFrom('mk.localhost:3000');

    expectDeniedBeforeSql(await getOpsClaimDetail('claim-1'));
  });

  it('fails closed in SQL for a foreign claim on an IDA host', async () => {
    requestFrom('ida.interdomestik.com');
    hoisted.claimsFindFirst.mockResolvedValueOnce(undefined);

    const result = await getOpsClaimDetail('claim-1');

    expect(result).toEqual({ kind: 'not_found' });
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.matchesAccessTenant).toHaveBeenCalledWith(expect.anything(), 'tenant_ks');
    expect(hoisted.dbSelect).not.toHaveBeenCalled();
  });

  it('scopes branch managers to their own branch on an IDA host', async () => {
    requestFrom('ida.interdomestik.com');
    signInAs({ role: 'branch_manager', branchId: 'branch-1' });
    mockSelectChains();

    const result = await getOpsClaimDetail('claim-1');

    expect(result.kind).toBe('ok');
    expect(hoisted.eq).toHaveBeenCalledWith('claims.branchId', 'branch-1');
  });

  it('denies another branch in SQL on an IDA host', async () => {
    requestFrom('ida.interdomestik.com');
    signInAs({ role: 'branch_manager', branchId: 'branch-2' });
    hoisted.claimsFindFirst.mockResolvedValueOnce(undefined);

    const result = await getOpsClaimDetail('claim-1');

    expect(result).toEqual({ kind: 'not_found' });
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.eq).toHaveBeenCalledWith('claims.branchId', 'branch-2');
  });

  it('denies a branch manager without a branch before SQL on an IDA host', async () => {
    requestFrom('ida.interdomestik.com');
    signInAs({ role: 'branch_manager' });

    expectDeniedBeforeSql(await getOpsClaimDetail('claim-1'));
  });

  it.each(['member', 'staff', 'agent'])(
    'denies the %s role before SQL on an IDA host',
    async role => {
      requestFrom('ida.interdomestik.com');
      signInAs({ role });

      expectDeniedBeforeSql(await getOpsClaimDetail('claim-1'));
    }
  );

  it('denies anonymous requests before SQL on an IDA host', async () => {
    requestFrom('ida.interdomestik.com');
    hoisted.getSession.mockResolvedValueOnce(null);

    expectDeniedBeforeSql(await getOpsClaimDetail('claim-1'));
  });
});
