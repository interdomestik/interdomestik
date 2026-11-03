import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TEST_PADDLE_DELIVERY,
  authorizeTestPaddleOwner,
} from '../../paddle-authority.test-support';

const hoisted = vi.hoisted(() => ({
  authorizePaddleTenant: vi.fn(),
  findFirst: vi.fn(),
  resolvePaddleUserOwner: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  authorizePaddleTenant: hoisted.authorizePaddleTenant,
  withTenantContext: hoisted.withTenantContext,
  resolvePaddleUserOwner: hoisted.resolvePaddleUserOwner,
}));

import { readPaddleCanonicalUser } from './canonical-user';

type FindFirstArgs = {
  where: (
    users: Record<string, string>,
    operators: {
      and: (...conditions: unknown[]) => unknown;
      eq: (left: unknown, right: unknown) => unknown;
    }
  ) => unknown;
  columns: Record<string, boolean>;
};

describe('readPaddleCanonicalUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.authorizePaddleTenant.mockImplementation(authorizeTestPaddleOwner);
    hoisted.withTenantContext.mockImplementation(async (_context, callback) =>
      callback({ query: { user: { findFirst: hoisted.findFirst } } })
    );
  });

  it('returns null without opening any tenant context when no unique owner exists', async () => {
    hoisted.resolvePaddleUserOwner.mockResolvedValue(null);

    await expect(readPaddleCanonicalUser(TEST_PADDLE_DELIVERY, 'user_unknown')).resolves.toBeNull();

    expect(hoisted.resolvePaddleUserOwner).toHaveBeenCalledWith('user_unknown');
    expect(hoisted.authorizePaddleTenant).not.toHaveBeenCalled();
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    expect(hoisted.findFirst).not.toHaveBeenCalled();
  });

  it('reads the profile in exactly one context for the owning tenant, bound to the user id and tenant', async () => {
    const record = {
      id: 'user_1',
      tenantId: 'tenant_ks',
      agentId: 'agent_1',
      email: 'member@example.com',
      name: 'Member',
      memberNumber: 'MEM-2026-000001',
    };
    const owner = { userId: 'user_1', tenantId: 'tenant_ks' };
    hoisted.resolvePaddleUserOwner.mockResolvedValue(owner);
    hoisted.findFirst.mockResolvedValue(record);

    const lookup = await readPaddleCanonicalUser(TEST_PADDLE_DELIVERY, 'user_1');

    expect(lookup?.user).toEqual(record);
    expect(hoisted.authorizePaddleTenant).toHaveBeenCalledTimes(1);
    expect(hoisted.authorizePaddleTenant).toHaveBeenCalledWith(TEST_PADDLE_DELIVERY, owner);
    expect(hoisted.authorizePaddleTenant.mock.calls[0]![1]).toBe(owner);
    const authority = hoisted.authorizePaddleTenant.mock.results[0]!.value;
    expect(lookup?.authority).toBe(authority);
    expect(readTenantAuthority(authority).tenantId).toBe('tenant_ks');
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(hoisted.findFirst).toHaveBeenCalledTimes(1);
    const args = hoisted.findFirst.mock.calls[0]![0] as FindFirstArgs;
    expect(args.columns).toEqual({
      id: true,
      tenantId: true,
      agentId: true,
      email: true,
      name: true,
      memberNumber: true,
    });
    const where = args.where(
      { id: 'user.id', tenantId: 'user.tenant_id' },
      {
        and: (...conditions) => ({ op: 'and', conditions }),
        eq: (left, right) => ({ op: 'eq', left, right }),
      }
    );
    expect(where).toEqual({
      op: 'and',
      conditions: [
        { op: 'eq', left: 'user.id', right: 'user_1' },
        { op: 'eq', left: 'user.tenant_id', right: 'tenant_ks' },
      ],
    });
  });

  it('uses the resolved owner, not the provider-supplied id, to choose the tenant and row', async () => {
    hoisted.resolvePaddleUserOwner.mockResolvedValue({
      userId: 'user_canonical',
      tenantId: 'tenant_mk',
    });
    hoisted.findFirst.mockResolvedValue(undefined);

    await expect(
      readPaddleCanonicalUser(TEST_PADDLE_DELIVERY, '  user_canonical ')
    ).resolves.toBeNull();

    expect(hoisted.withTenantContext).toHaveBeenCalledWith(
      hoisted.authorizePaddleTenant.mock.results[0]!.value,
      expect.any(Function)
    );
    expect(readTenantAuthority(hoisted.authorizePaddleTenant.mock.results[0]!.value).tenantId).toBe(
      'tenant_mk'
    );
    const args = hoisted.findFirst.mock.calls[0]![0] as FindFirstArgs;
    const where = args.where(
      { id: 'user.id', tenantId: 'user.tenant_id' },
      {
        and: (...conditions) => conditions,
        eq: (left, right) => [left, right],
      }
    );
    expect(where).toEqual([
      ['user.id', 'user_canonical'],
      ['user.tenant_id', 'tenant_mk'],
    ]);
  });

  it('returns null when the owner is not visible inside its own tenant', async () => {
    hoisted.resolvePaddleUserOwner.mockResolvedValue({ userId: 'user_1', tenantId: 'tenant_ks' });
    hoisted.findFirst.mockResolvedValue(undefined);

    await expect(readPaddleCanonicalUser(TEST_PADDLE_DELIVERY, 'user_1')).resolves.toBeNull();
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the loaded record names a different tenant than the owner authority', async () => {
    hoisted.resolvePaddleUserOwner.mockResolvedValue({ userId: 'user_1', tenantId: 'tenant_ks' });
    hoisted.findFirst.mockResolvedValue({
      id: 'user_1',
      tenantId: 'tenant_mk',
      agentId: null,
      email: 'member@example.com',
      name: 'Member',
      memberNumber: null,
    });

    await expect(readPaddleCanonicalUser(TEST_PADDLE_DELIVERY, 'user_1')).rejects.toThrow(
      'tenant conflict'
    );
  });
});
