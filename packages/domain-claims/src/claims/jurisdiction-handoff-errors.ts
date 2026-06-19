export type JurisdictionHandoffRollbackCode =
  | 'handoff_active_grant_conflict'
  | 'handoff_correlation_conflict'
  | 'handoff_grant_expired'
  | 'handoff_grant_expiry_conflict'
  | 'handoff_grant_revoked';

export class JurisdictionHandoffRollbackError extends Error {
  constructor(readonly code: JurisdictionHandoffRollbackCode) {
    super(code);
    this.name = 'JurisdictionHandoffRollbackError';
  }
}
