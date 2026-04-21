import {
  getMembershipLifecycleBucket,
  membershipLifecycleGrantsAccess,
  type MembershipLifecycleBucket,
  type MembershipLifecycleInput,
} from './subscription/lifecycle-reporting';
import {
  resolveCommissionOwnership,
  type CommissionOwnershipResolution,
  type ResolveCommissionOwnershipInput,
} from './commissions/ownership';

export type EnterpriseControl = 'ownership' | 'lifecycle' | 'branch' | 'finance';

export type ControlViolation = {
  control: EnterpriseControl;
  code: string;
  detail: string;
  recoverable: boolean;
  entityIds?: string[];
  causes?: ControlViolation[];
};

export type ControlResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      violation: ControlViolation;
    };

export type OwnershipControlInput = ResolveCommissionOwnershipInput & {
  commissionId?: string | null;
};

export type LifecycleCommissionInput = {
  commissionId?: string | null;
  bucket?: MembershipLifecycleBucket;
  subscription?: MembershipLifecycleInput;
  now?: Date;
};

export type FinancePayabilityInput = OwnershipControlInput &
  LifecycleCommissionInput & {
    commissionId: string;
  };

export function checkOwnershipControl(
  input: OwnershipControlInput
): ControlResult<CommissionOwnershipResolution> {
  const resolution = resolveCommissionOwnership(input);
  const entityIds = normalizeEntityIds(input.commissionId);

  if (resolution.ownerType === 'unresolved') {
    return {
      ok: false,
      violation: {
        control: 'ownership',
        code: 'OWNERSHIP_UNRESOLVED',
        detail: buildEntityDetail('Commission ownership is unresolved', entityIds),
        recoverable: false,
        entityIds,
      },
    };
  }

  if (resolution.diagnostics.length > 0) {
    return {
      ok: false,
      violation: {
        control: 'ownership',
        code: 'OWNERSHIP_DRIFT',
        detail: buildEntityDetail('Commission ownership signals disagree', entityIds),
        recoverable: false,
        entityIds,
      },
    };
  }

  return {
    ok: true,
    value: resolution,
  };
}

export function assertLifecycleEligibleForCommission(
  input: LifecycleCommissionInput
): ControlResult<MembershipLifecycleBucket> {
  const bucket =
    input.bucket ??
    getMembershipLifecycleBucket({
      subscription: input.subscription,
      now: input.now,
    });
  const entityIds = normalizeEntityIds(input.commissionId);

  if (!membershipLifecycleGrantsAccess(bucket)) {
    return {
      ok: false,
      violation: {
        control: 'lifecycle',
        code: 'LIFECYCLE_INELIGIBLE',
        detail: buildEntityDetail(
          `Commission lifecycle bucket is not eligible for payability: ${bucket}`,
          entityIds
        ),
        recoverable: false,
        entityIds,
      },
    };
  }

  return {
    ok: true,
    value: bucket,
  };
}

export function guardBranchStatsScope(args: {
  tenantId?: string | null;
  branchId?: string | null;
  branchTenantId?: string | null;
}): ControlResult<{ tenantId: string; branchId: string }> {
  const tenantId = normalizeRequiredId(args.tenantId);
  const branchId = normalizeRequiredId(args.branchId);

  if (!tenantId) {
    return {
      ok: false,
      violation: {
        control: 'branch',
        code: 'BRANCH_TENANT_MISSING',
        detail: 'Branch stats require a tenantId before aggregate reads run',
        recoverable: false,
      },
    };
  }

  if (!branchId) {
    return {
      ok: false,
      violation: {
        control: 'branch',
        code: 'BRANCH_ID_MISSING',
        detail: 'Branch stats require a branchId before aggregate reads run',
        recoverable: false,
      },
    };
  }

  const branchTenantId = normalizeRequiredId(args.branchTenantId);
  if (branchTenantId && branchTenantId !== tenantId) {
    return {
      ok: false,
      violation: {
        control: 'branch',
        code: 'BRANCH_SCOPE_MISMATCH',
        detail: `Branch stats scope mismatch for branch ${branchId}`,
        recoverable: false,
        entityIds: [branchId],
      },
    };
  }

  return {
    ok: true,
    value: { tenantId, branchId },
  };
}

export function assertFinancePayability(input: FinancePayabilityInput): ControlResult<{
  ownership: CommissionOwnershipResolution;
  lifecycleBucket: MembershipLifecycleBucket;
}> {
  const ownership = checkOwnershipControl(input);
  const lifecycle = assertLifecycleEligibleForCommission(input);
  if (ownership.ok && lifecycle.ok) {
    return {
      ok: true,
      value: {
        ownership: ownership.value,
        lifecycleBucket: lifecycle.value,
      },
    };
  }

  const causes: ControlViolation[] = [];
  if (!ownership.ok) causes.push(ownership.violation);
  if (!lifecycle.ok) causes.push(lifecycle.violation);

  const entityIds = [...new Set(causes.flatMap(cause => cause.entityIds ?? []))];
  return {
    ok: false,
    violation: {
      control: 'finance',
      code: 'FINANCE_PAYABILITY_BLOCKED',
      detail: buildEntityDetail('Commission is not payable under enterprise controls', entityIds),
      recoverable: false,
      entityIds,
      causes,
    },
  };
}

export function combineControlViolations(args: {
  control: EnterpriseControl;
  code: string;
  detail: string;
  violations: ControlViolation[];
}): ControlViolation {
  const entityIds = [...new Set(args.violations.flatMap(violation => violation.entityIds ?? []))];
  const detail = entityIds.length > 0 ? `${args.detail}: ${entityIds.join(', ')}` : args.detail;

  return {
    control: args.control,
    code: args.code,
    detail,
    recoverable: args.violations.every(violation => violation.recoverable),
    entityIds,
    causes: args.violations,
  };
}

export function formatControlViolation(violation: ControlViolation): string {
  return `${violation.code}: ${violation.detail}`;
}

function normalizeRequiredId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeEntityIds(id: string | null | undefined): string[] {
  const normalized = normalizeRequiredId(id);
  return normalized ? [normalized] : [];
}

function buildEntityDetail(detail: string, entityIds: string[]): string {
  if (entityIds.length === 0) return detail;
  return `${detail}: ${entityIds.join(', ')}`;
}
