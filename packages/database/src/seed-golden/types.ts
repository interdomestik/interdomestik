import type { SQL } from 'drizzle-orm';
import type { SeedConfig } from '../seed-types';

export type SeedGoldenSchema = typeof import('../schema');
export type SeedGoldenDb = (typeof import('../db'))['db'];
export type ClaimEscalationAgreementInsert =
  SeedGoldenSchema['claimEscalationAgreements']['$inferInsert'];

export type SeedGoldenSql = (typeof import('drizzle-orm'))['sql'];

export interface SeedGoldenContext {
  at: SeedConfig['at'];
  db: SeedGoldenDb;
  schema: SeedGoldenSchema;
  sql: SeedGoldenSql;
}

export type GoldenTenantKey = 'MK' | 'KS' | 'PILOT';

export type GoldenTenants = Record<GoldenTenantKey, string>;

export type SeedGoldenStepName =
  | 'cleanup'
  | 'tenants'
  | 'branches'
  | 'users'
  | 'agent-assignments'
  | 'memberships'
  | 'agent-settings'
  | 'claims'
  | 'leads'
  | 'tracking-tokens'
  | 'member-counters';

export type ClaimInsert = SeedGoldenSchema['claims']['$inferInsert'];
export type SqlExpression = SQL<unknown>;
