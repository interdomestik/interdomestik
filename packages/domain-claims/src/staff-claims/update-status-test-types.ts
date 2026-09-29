import type { Mock } from 'vitest';

export type SelectChain = {
  from: Mock;
  leftJoin: Mock;
  where: Mock;
  for: Mock;
  limit: Mock;
};

type Table = Record<string, string>;
export type TestMocks = {
  db: { query: { user: { findFirst: Mock } }; select: Mock; transaction: Mock };
  logAuditEvent: Mock;
  projectClaimStatusAuditProjection: Mock;
  and: Mock;
  claims: Table;
  claimEscalationAgreements: Table;
  subscriptions: Table;
  serviceUsage: Table;
  claimStageHistory: Table;
  claimStatusSchema: { safeParse: Mock };
  eq: Mock;
  sql: Mock;
  withTenant: Mock;
  ensureTenantId: Mock;
  agreementSelectChain: SelectChain;
  subscriptionSelectChain: SelectChain;
  serviceUsageExistsSelectChain: SelectChain;
  serviceUsageCountSelectChain: SelectChain;
  tenantReadSelectChain: SelectChain;
  txInsert: Mock;
  txExecute: Mock;
  txSelect: Mock;
  txSelectChain: SelectChain;
  txInsertOnConflictDoNothing: Mock;
  txInsertReturning: Mock;
  txInsertValues: Mock;
  txUpdate: Mock;
  txUpdateReturning: Mock;
  txUpdateSet: Mock;
  txUpdateWhere: Mock;
  withTenantContext: Mock;
};
