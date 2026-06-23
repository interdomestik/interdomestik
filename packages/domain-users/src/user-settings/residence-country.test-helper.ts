import { vi, type Mock } from 'vitest';

type TableColumns = {
  id: string;
  createdAt: string;
  recoveryLifecycleState: string;
  residenceCountry: string;
  tenantId: string;
  termsVersionAccepted: string;
  updatedAt: string;
  userId: string;
};

type ResidenceCountryMocks = {
  appendEvent: Mock;
  eq: Mock;
  inArray: Mock;
  logAuditEvent: Mock;
  table: (name: string) => TableColumns;
  transaction: Mock;
};

const hoisted: ResidenceCountryMocks = vi.hoisted(() => ({
  appendEvent: vi.fn(),
  eq: vi.fn((field, value) => ({ field, op: 'eq', value })),
  inArray: vi.fn((field, values) => ({ field, op: 'in', values })),
  logAuditEvent: vi.fn(),
  table: (name: string) => ({
    id: `${name}.id`,
    createdAt: `${name}.createdAt`,
    recoveryLifecycleState: `${name}.recoveryLifecycleState`,
    residenceCountry: `${name}.residenceCountry`,
    tenantId: `${name}.tenantId`,
    termsVersionAccepted: `${name}.termsVersionAccepted`,
    updatedAt: `${name}.updatedAt`,
    userId: `${name}.userId`,
  }),
  transaction: vi.fn(),
}));

export const mocks = hoisted;

function chain(result: unknown) {
  const limited = { limit: vi.fn(async () => result) };
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({ ...limited, orderBy: vi.fn(() => limited) })),
    })),
  };
}

function chainMany(result: unknown) {
  return { from: vi.fn(() => ({ where: vi.fn(async () => result) })) };
}

vi.mock('@interdomestik/database', () => ({
  and: vi.fn((...args) => ({ args, op: 'and' })),
  appendEvent: mocks.appendEvent,
  claims: mocks.table('claims'),
  db: { transaction: mocks.transaction },
  desc: vi.fn(field => ({ direction: 'desc', field })),
  eq: mocks.eq,
  inArray: mocks.inArray,
  subscriptions: mocks.table('subscriptions'),
  user: mocks.table('user'),
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn((tenantId, column, condition) => ({ column, condition, tenantId })),
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn(session => {
    if (!session?.user?.tenantId) throw new Error('No tenant');
    return session.user.tenantId;
  }),
}));

vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'corr-1') }));

export const session = { user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' } };

export function mockTx(input: {
  activeRecoveryClaims?: unknown[];
  appendEventFails?: boolean;
  currentResidence?: string | null;
  termsVersionAccepted?: string | null;
}): { tx: { select: Mock; update: Mock }; updateSet: Mock } {
  const updateSet = vi.fn(() => ({ where: vi.fn() }));
  const tx = {
    select: vi
      .fn()
      .mockReturnValueOnce(chain([{ residenceCountry: input.currentResidence ?? 'DE' }]))
      .mockReturnValueOnce(chain([{ termsVersionAccepted: input.termsVersionAccepted ?? 'v1' }]))
      .mockReturnValueOnce(chainMany(input.activeRecoveryClaims ?? [])),
    update: vi.fn(() => ({ set: updateSet })),
  };
  mocks.transaction.mockImplementation(async callback => callback(tx));
  mocks.appendEvent.mockImplementation(async () => {
    if (input.appendEventFails) throw new Error('event failed');
    return { id: 'event-1' };
  });
  return { tx, updateSet };
}

export function lastEventPayload() {
  return mocks.appendEvent.mock.calls[0]?.[1]?.payload;
}
