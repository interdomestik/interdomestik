import type {
  EntityMigrationReadinessCandidate,
  EntityMigrationReadinessOptions,
  EntityMigrationReadinessResult,
  EntityMigrationRepairCategory,
} from '../entity-migration-readiness';

export type MemberEntityMigrationMode = 'dry_run' | 'apply';
export type MemberEntityRollbackMode = 'rollback';
export type MemberEntityMigrationTermsAction = 'reissue_and_recapture';
export type MemberEntityMigrationApprovalKind = 'human_approval' | 'explicit_waiver';

export interface MemberEntityMigrationApproval {
  readonly kind: MemberEntityMigrationApprovalKind;
  readonly reference: string;
  readonly approvedBy: string;
}

export interface MemberEntitySnapshot {
  readonly legalTenantId: string | null;
  readonly legalEntityId: string | null;
  readonly governingLawSnapshot: string | null;
  readonly termsVersionAccepted: string | null;
}

export interface MemberEntityMigrationTarget {
  readonly legalTenantId: string;
  readonly legalEntityId: string;
  readonly governingLawSnapshot: string;
  readonly termsVersionAccepted: string;
}

export type MemberEntityMigrationWriteTarget = MemberEntityMigrationTarget | MemberEntitySnapshot;

export type MemberEntityMigrationBlockedStatus =
  | 'blocked_active_recovery_runoff'
  | 'blocked_repair_required'
  | 'blocked_approval_required'
  | 'blocked_invalid_approval';

export interface MemberEntityMigrationPlan {
  readonly memberId: string;
  readonly tenantId: string;
  readonly subscriptionId: string;
  readonly mode: MemberEntityMigrationMode;
  readonly status: 'ready' | 'dry_run_ready' | MemberEntityMigrationBlockedStatus;
  readonly previous: MemberEntitySnapshot;
  readonly target: MemberEntityMigrationTarget | null;
  readonly readiness: EntityMigrationReadinessResult;
  readonly termsAction: MemberEntityMigrationTermsAction | null;
  readonly approval: MemberEntityMigrationApproval | null;
  readonly dataRepairCategories: readonly EntityMigrationRepairCategory[];
  readonly writesPlanned: boolean;
}

export interface MemberEntityMigrationCommand {
  readonly candidate: EntityMigrationReadinessCandidate;
  readonly mode: MemberEntityMigrationMode;
  readonly readinessOptions?: EntityMigrationReadinessOptions;
  readonly approval?: MemberEntityMigrationApproval | null;
}

export interface MemberEntityRollbackCommand {
  readonly memberId: string;
  readonly tenantId: string;
  readonly subscriptionId: string;
  readonly current: MemberEntitySnapshot;
  readonly previous: MemberEntitySnapshot;
  readonly activeRecoveryCaseCount: number;
  readonly approval: MemberEntityMigrationApproval;
}

export interface MemberEntityMigrationHistoryEntry {
  readonly memberId: string;
  readonly tenantId: string;
  readonly subscriptionId: string;
  readonly previous: MemberEntitySnapshot;
  readonly target: MemberEntityMigrationWriteTarget;
  readonly termsAction: MemberEntityMigrationTermsAction;
  readonly approval: MemberEntityMigrationApproval;
}

export interface MemberEntityMigrationEventPayload {
  readonly activeRecoveryCaseCount: number;
  readonly approvalKind: MemberEntityMigrationApprovalKind;
  readonly fromGoverningLaw: string | null;
  readonly fromLegalEntityId: string | null;
  readonly fromLegalTenantId: string | null;
  readonly fromTermsVersionAccepted: string | null;
  readonly migrationMode: MemberEntityMigrationMode | MemberEntityRollbackMode;
  readonly termsAction: MemberEntityMigrationTermsAction;
  readonly toGoverningLaw: string | null;
  readonly toLegalEntityId: string | null;
  readonly toLegalTenantId: string | null;
  readonly toTermsVersionAccepted: string | null;
}

export interface MemberEntityMigrationWritePort {
  readonly withTransaction: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly updateSubscriptionLegalEntity: (input: {
    readonly subscriptionId: string;
    readonly tenantId: string;
    readonly target: MemberEntityMigrationWriteTarget;
  }) => Promise<void>;
  readonly recordTermsAcceptance: (input: {
    readonly memberId: string;
    readonly tenantId: string;
    readonly subscriptionId: string;
    readonly termsVersion: string;
    readonly approval: MemberEntityMigrationApproval;
  }) => Promise<void>;
  readonly appendMigrationHistory: (entry: MemberEntityMigrationHistoryEntry) => Promise<void>;
  readonly appendEntityMigratedEvent: (input: {
    readonly memberId: string;
    readonly tenantId: string;
    readonly subscriptionId: string;
    readonly payload: MemberEntityMigrationEventPayload;
  }) => Promise<void>;
}

export type MemberEntityMigrationResult =
  | {
      readonly ok: true;
      readonly plan: MemberEntityMigrationPlan;
      readonly eventPayload: MemberEntityMigrationEventPayload | null;
    }
  | {
      readonly ok: false;
      readonly plan: MemberEntityMigrationPlan;
      readonly reason: MemberEntityMigrationBlockedStatus;
    };
