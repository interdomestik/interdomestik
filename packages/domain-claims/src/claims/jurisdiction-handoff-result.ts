import type { CaseScopedAccessGrant } from '@interdomestik/shared-auth';

import type { JurisdictionHandoffRollbackCode } from './jurisdiction-handoff-errors';

type JurisdictionHandoffPreCommitError =
  | 'actor_not_authorized'
  | 'claim_not_found'
  | 'grant_actor_not_recovery_tenant'
  | 'recovery_legal_tenant_conflict'
  | 'self_grant_denied'
  | 'unsupported_incident_jurisdiction';

export type JurisdictionHandoffTransactionResult =
  | { success: true; grant: CaseScopedAccessGrant; status: 'created' | 'already_exists' }
  | { success: true; grant: null; status: 'not_required' }
  | { success: false; error: JurisdictionHandoffPreCommitError };

export type JurisdictionHandoffResult =
  | JurisdictionHandoffTransactionResult
  | { success: false; error: JurisdictionHandoffRollbackCode };
