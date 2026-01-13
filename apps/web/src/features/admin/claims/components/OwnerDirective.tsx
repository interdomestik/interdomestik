import { Badge } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';

import type { ClaimStatus } from '@interdomestik/database/constants';
import type { OwnerRole, WaitingOn } from '../types';
import { isStaffOwnedStatus, isTerminalStatus, STATUS_TO_OWNER } from '../types';

export interface OwnerDirectiveProps {
  ownerRole: OwnerRole;
  ownerName: string | undefined;
  waitingOn: WaitingOn;
  isUnassigned: boolean;
  status: ClaimStatus;
}

/**
 * Directive variant for the PRIMARY directive line.
 * Derived from STATUS_TO_OWNER — never hard-coded UI heuristics.
 */
export type PrimaryDirectiveVariant =
  | 'staff_action_required'
  | 'staff_action_with_name'
  | 'member_waiting'
  | 'system_completed'
  | 'unknown_status';

/**
 * Determines primary directive variant based on STATUS_TO_OWNER mapping.
 * Includes unknown/invalid status fallback (PRD rule 2).
 */
export function getPrimaryDirectiveVariant(
  status: ClaimStatus,
  ownerName: string | undefined
): PrimaryDirectiveVariant {
  const owner = STATUS_TO_OWNER[status];

  switch (owner) {
    case 'member':
      return 'member_waiting';
    case 'staff':
      return ownerName ? 'staff_action_with_name' : 'staff_action_required';
    case 'system':
      return 'system_completed';
    default:
      // Unknown/invalid status fallback (PRD rule 2)
      return 'unknown_status';
  }
}

/**
 * Determines if the unassigned badge should be shown.
 *
 * Per PRD rules:
 * - Show only for "Assign owner" cases
 * - Logic: isUnassigned && staffOwned && waitingOn != member && !terminal
 */
export function shouldShowUnassignedBadge(
  status: ClaimStatus,
  isUnassigned: boolean,
  waitingOn: WaitingOn
): boolean {
  return (
    isUnassigned &&
    isStaffOwnedStatus(status) &&
    waitingOn !== 'member' &&
    !isTerminalStatus(status)
  );
}

// Styling configuration per variant
const VARIANT_STYLES: Record<PrimaryDirectiveVariant, string> = {
  staff_action_required: 'text-amber-600 font-medium',
  staff_action_with_name: 'text-foreground font-medium',
  member_waiting: 'text-xs text-muted-foreground',
  system_completed: 'text-xs text-muted-foreground/60',
  unknown_status: 'text-xs text-orange-500 font-medium', // Needs review = active/warning color
};

/**
 * OwnerDirective — Two-part directive model (Phase 2.6.1)
 *
 * Visual Hierarchy per PRD:
 * 1. PRIMARY DIRECTIVE — always shown, explains who acts next
 * 2. SECONDARY BADGE — conditional "Assign owner" warning
 *
 * Data rules:
 * - waitingOn must come from mapper/policy, not recomputed here
 * - If waitingOn undefined, treat as null (no default to 'member')
 * - Unknown status falls back to unknown_status ("Needs Review")
 */
export function OwnerDirective({
  ownerName,
  waitingOn,
  isUnassigned,
  status,
}: OwnerDirectiveProps) {
  const t = useTranslations('admin.claims_page');

  // Guard: waitingOn must be derived from mapper. If undefined, treat as null.
  // Never default to 'member' to avoid false positives.
  const effectiveWaitingOn = waitingOn ?? null;

  // Derive primary variant from STATUS_TO_OWNER (PRD rule 1)
  const variant = getPrimaryDirectiveVariant(status, ownerName);

  // Safety/Telemetry: Log if we hit unknown status fallback (PRD Rule 2 amendment)
  if (variant === 'unknown_status') {
    console.error(`[OwnerDirective] encountered unknown or invalid status: "${status}"`);
  }

  // Determine if badge should show (PRD rules)
  const showBadge = shouldShowUnassignedBadge(status, isUnassigned, effectiveWaitingOn);

  // Derive text for primary variant
  // Note: ownerName is passed ONLY if it exists, otherwise empty string default for safety (though i18n usually handles undefined)
  // But strictly following PRD: "name: undefined (never '')".
  // However, t() function usually expects value if param exists in string.
  // 'staff_action_with_name' expects {name}. 'staff_action_required' expects nothing.
  const primaryText =
    variant === 'staff_action_with_name'
      ? t(`operational_card.directive.${variant}`, { name: ownerName ?? '' })
      : t(`operational_card.directive.${variant}`);

  // 1. Special Case: Assigned Staff (Visual Emphasis)
  if (variant === 'staff_action_with_name') {
    return (
      <div className="flex items-center gap-2" data-testid="owner-directive-container">
        {/* PRIMARY DIRECTIVE — Screaming Badge for Assignee */}
        <Badge
          className="bg-indigo-600 hover:bg-indigo-700 text-white border-0 font-semibold shadow-sm px-2.5 py-0.5 h-6 transition-all cursor-default"
          data-testid="primary-directive-badge"
        >
          {primaryText}
        </Badge>
      </div>
    );
  }

  // 2. Default Case: Text Directive + Optional Badge
  return (
    <div className="flex items-center gap-2" data-testid="owner-directive-container">
      {/* PRIMARY DIRECTIVE — always shown */}
      <span className={`text-sm ${VARIANT_STYLES[variant]}`} data-testid="primary-directive">
        {primaryText}
      </span>

      {/* SECONDARY BADGE — conditional */}
      {showBadge && (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 h-5 text-orange-600 border-orange-200 bg-orange-50"
          data-testid="unassigned-badge"
        >
          {t('operational_card.badge.unassigned')}
        </Badge>
      )}
    </div>
  );
}
