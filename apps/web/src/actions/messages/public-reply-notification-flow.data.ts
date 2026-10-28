/** In-memory boundary fixture; does not attest PostgreSQL/RLS or deployed behavior. */
import type { Session } from './context';

export type Row = { id: string; tenantId: string; [key: string]: unknown };
export type Column = { field: string };
export type Predicate = (row: Row) => boolean;
export type Find = {
  where?: Predicate | ((table: Record<string, Column>, ops: typeof operators) => Predicate);
};
const eq =
  (column: Column, value: unknown): Predicate =>
  row =>
    row[column.field] === value;
const and =
  (...predicates: Predicate[]): Predicate =>
  row =>
    predicates.every(p => p(row));
const or =
  (...predicates: Predicate[]): Predicate =>
  row =>
    predicates.some(p => p(row));
export const operators = {
  eq,
  and,
  or,
  inArray: (c: Column, values: unknown[]) => (r: Row) => values.includes(r[c.field]),
};
const columns = [
  'id',
  'tenantId',
  'claimId',
  'userId',
  'senderId',
  'content',
  'isInternal',
  'readAt',
  'createdAt',
  'name',
  'image',
  'role',
  'email',
  'emailVerified',
  'agentId',
  'memberId',
  'status',
  'endpoint',
  'p256dh',
  'auth',
  'pushMessages',
  'type',
  'title',
  'actionUrl',
  'isRead',
];
export const tables = Object.fromEntries(
  [
    'claims',
    'user',
    'agentClients',
    'claimMessages',
    'notifications',
    'pushSubscriptions',
    'userNotificationPreferences',
  ].map(name => [name, Object.fromEntries(columns.map(field => [field, { field }]))])
);
export const ids = {
  tenant: 'fixture-tenant-a',
  otherTenant: 'fixture-tenant-b',
  staff: 'staff-a',
  member: 'member-a',
  foreign: 'member-b',
  agent: 'agent-a',
  claim: 'claim-a',
};
const user = (id: string, tenantId: string, role: string): Row => ({
  id,
  tenantId,
  role,
  name: id,
  email: `${id}@example.test`,
  emailVerified: true,
  image: null,
});
export const session = (role = 'staff', overrides: Record<string, unknown> = {}) =>
  ({
    user: {
      id: role === 'member' ? ids.member : role === 'agent' ? ids.agent : ids.staff,
      role,
      tenantId: ids.tenant,
      branchId: 'branch-a',
      name: 'Synthetic sender',
      ...overrides,
    },
  }) as NonNullable<Session>;

export function seedRows(): Record<string, Row[]> {
  return {
    user: [
      user(ids.staff, ids.tenant, 'staff'),
      user(ids.member, ids.tenant, 'member'),
      user(ids.foreign, ids.otherTenant, 'member'),
      user(ids.agent, ids.tenant, 'agent'),
    ],
    claims: [
      {
        id: ids.claim,
        tenantId: ids.tenant,
        userId: ids.member,
        staffId: ids.staff,
        branchId: 'branch-a',
        title: 'Synthetic case',
      },
      {
        id: 'claim-b',
        tenantId: ids.otherTenant,
        userId: ids.foreign,
        branchId: 'branch-b',
        title: 'Other case',
      },
    ],
    agentClients: [
      {
        id: 'link-a',
        tenantId: ids.tenant,
        agentId: ids.agent,
        memberId: ids.member,
        status: 'active',
      },
    ],
    claimMessages: [],
    notifications: [],
    pushSubscriptions: [],
    userNotificationPreferences: [],
  };
}

export const cleanupSubscriptions: Row[] = [
  {
    id: 'own-expired',
    tenantId: ids.tenant,
    userId: ids.member,
    endpoint: 'https://push.example.test/own',
    p256dh: 'synthetic',
    auth: 'synthetic',
  },
  {
    id: 'own-live',
    tenantId: ids.tenant,
    userId: ids.member,
    endpoint: 'https://push.example.test/live',
    p256dh: 'synthetic',
    auth: 'synthetic',
  },
  {
    id: 'other-user',
    tenantId: ids.tenant,
    userId: 'member-a2',
    endpoint: 'https://push.example.test/other',
    p256dh: 'synthetic',
    auth: 'synthetic',
  },
  {
    id: 'foreign',
    tenantId: ids.otherTenant,
    userId: ids.foreign,
    endpoint: 'https://push.example.test/foreign',
    p256dh: 'synthetic',
    auth: 'synthetic',
  },
];
