import type { StaffClaimContextGroup } from './StaffClaimContext';
import type { StaffClaimSectionLink } from './StaffClaimWorkspaceHeader';

/** Section ids the mounted staff claim route owns, in the order it renders them. */
export const SECTION_HANDLING = 'staff-claim-handling';
export const SECTION_REQUESTS = 'staff-claim-requests';
export const SECTION_MESSAGES = 'staff-claim-messages';
export const SECTION_CONTEXT = 'staff-claim-context';
// StaffStatusHistory owns this anchor; the workspace only links to it.
export const SECTION_HISTORY = 'staff-status-history';
export const SECTION_HEADING =
  'text-sm font-semibold uppercase tracking-wide text-muted-foreground';

export type StaffClaimSectionLabels = Readonly<{
  context: string;
  handling: string;
  history: string;
  messages: string;
  requests: string;
}>;

/**
 * Destinations the workspace header links to. Staff-only sections are omitted for roles that do
 * not render them, so the nav can never point at a section that is not mounted.
 */
export function buildStaffClaimSections(
  isStaff: boolean,
  labels: StaffClaimSectionLabels
): readonly StaffClaimSectionLink[] {
  return [
    ...(isStaff ? [{ id: SECTION_HANDLING, label: labels.handling }] : []),
    { id: SECTION_REQUESTS, label: labels.requests },
    ...(isStaff ? [{ id: SECTION_MESSAGES, label: labels.messages }] : []),
    { id: SECTION_CONTEXT, label: labels.context },
    { id: SECTION_HISTORY, label: labels.history },
  ];
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Formats a recorded timestamp. Only real Date, string and number values are narrowed, so no
 * value can reach Object's default stringification; everything else keeps the shipped fallback.
 */
export function formatClaimDate(value: unknown, locale: string): string {
  if (!value) return '-';
  const date = toDate(value);
  return date ? date.toLocaleDateString(locale) : '-';
}

export function findAssigneeLabel(
  options: readonly Readonly<{ id: string; label: string }>[],
  assigneeId: string | null | undefined
): string | null {
  return options.find(option => option.id === assigneeId)?.label ?? null;
}

/** Messages already loaded on the server; a failed read renders the panel with no history. */
export function readInitialMessages<TMessage>(
  result: Readonly<{ success: boolean; messages?: TMessage[] | null }>
): TMessage[] {
  return result.success && result.messages ? result.messages : [];
}

/**
 * Phase derivation stays operative; this only decides whether the route shows its neutral generic
 * verification copy instead of the phase label, so it never implies an outstanding member duty.
 */
export function isVerificationGuidancePhase(claimStatus: string, slaPhase: string): boolean {
  return claimStatus === 'verification' && slaPhase === 'incomplete';
}

export type StaffClaimContextLabels = Readonly<{
  agentTitle: string;
  agentUnassigned: string;
  allowanceRemaining: string;
  allowanceTitle: string;
  allowanceTotal: string;
  allowanceUsed: string;
  claimTitle: string;
  memberTitle: string;
  membershipField: string;
  nameField: string;
  slaTitle: string;
  statusField: string;
  submittedField: string;
  updatedField: string;
}>;

export type StaffClaimContextInput = Readonly<{
  agent?: Readonly<{ name: string }> | null;
  labels: StaffClaimContextLabels;
  locale: string;
  matterAllowance?: Readonly<{
    allowanceTotal: number;
    consumedCount: number;
    remainingCount: number;
  }> | null;
  memberFullName: string;
  membershipNumber?: string | null;
  slaPhase: string;
  slaPhaseLabel: string;
  statusValue: string;
  submittedAt: unknown;
  updatedAt: unknown;
}>;

/** Secondary read-only case context, shaped for the presentational context section. */
export function buildStaffClaimContextGroups(
  input: StaffClaimContextInput
): readonly (StaffClaimContextGroup | null)[] {
  const { labels, locale } = input;
  return [
    {
      testId: 'staff-claim-detail-claim',
      title: labels.claimTitle,
      fields: [
        { label: labels.statusField, value: input.statusValue },
        { label: labels.updatedField, value: formatClaimDate(input.updatedAt, locale) },
        { label: labels.submittedField, value: formatClaimDate(input.submittedAt, locale) },
      ],
    },
    {
      testId: 'staff-claim-detail-member',
      title: labels.memberTitle,
      fields: [
        { label: labels.nameField, value: input.memberFullName },
        { label: labels.membershipField, value: input.membershipNumber || '-' },
      ],
    },
    input.matterAllowance
      ? {
          columns: 'md:grid-cols-3',
          testId: 'staff-claim-detail-matter-allowance',
          title: labels.allowanceTitle,
          fields: [
            {
              label: labels.allowanceUsed,
              testId: 'staff-claim-detail-matter-allowance-used',
              value: String(input.matterAllowance.consumedCount),
            },
            {
              label: labels.allowanceRemaining,
              testId: 'staff-claim-detail-matter-allowance-remaining',
              value: String(input.matterAllowance.remainingCount),
            },
            {
              label: labels.allowanceTotal,
              testId: 'staff-claim-detail-matter-allowance-total',
              value: String(input.matterAllowance.allowanceTotal),
            },
          ],
        }
      : null,
    input.slaPhase !== 'not_applicable'
      ? {
          note: { testId: 'staff-claim-detail-sla-phase', value: input.slaPhaseLabel },
          testId: 'staff-claim-detail-sla',
          title: labels.slaTitle,
        }
      : null,
    {
      note: input.agent
        ? { value: input.agent.name }
        : { muted: true, value: labels.agentUnassigned },
      testId: 'staff-claim-detail-agent',
      title: labels.agentTitle,
    },
  ];
}
