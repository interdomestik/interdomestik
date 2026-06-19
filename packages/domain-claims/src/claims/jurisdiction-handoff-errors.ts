export class JurisdictionHandoffRollbackError extends Error {
  constructor(
    readonly code:
      | 'handoff_active_grant_conflict'
      | 'handoff_correlation_conflict'
      | 'handoff_grant_revoked'
  ) {
    super(code);
    this.name = 'JurisdictionHandoffRollbackError';
  }
}
