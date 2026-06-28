import { parseDiasporaOriginFromPublicNote } from '../claims/diaspora-origin';
import { resolveClaimLifecycleReadProjection } from '../claims/lifecycle-read-model';

export type StaffClaimsListItem = {
  id: string;
  claimNumber: string | null;
  companyName: string | null;
  title: string | null;
  status: string | null;
  staffId: string | null;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  stageLabel: string;
  updatedAt: string | null;
  memberName?: string;
  memberNumber?: string | null;
  isDiasporaOrigin: boolean;
  diasporaCountry: string | null;
};

type ClaimRow = {
  id: string;
  claimNumber: string | null;
  companyName: string | null;
  title: string | null;
  status: string | null;
  caseLifecycleState: string | null;
  recoveryLifecycleState: string | null;
  staffId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  updatedAt: Date | string | null;
  memberName: string | null;
  memberNumber: string | null;
};
type HistoryRow = { claimId: string; note: string | null };

function formatStageLabel(status: string | null | undefined) {
  if (!status) return 'Draft';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapDiasporaOrigins(historyRows: HistoryRow[]) {
  const byClaimId = new Map<
    string,
    NonNullable<ReturnType<typeof parseDiasporaOriginFromPublicNote>>
  >();

  for (const historyRow of historyRows) {
    if (byClaimId.has(historyRow.claimId)) continue;
    const diasporaOrigin = parseDiasporaOriginFromPublicNote(historyRow.note);
    if (diasporaOrigin !== null) byClaimId.set(historyRow.claimId, diasporaOrigin);
  }

  return byClaimId;
}

export function mapStaffClaimsListRows(
  rows: ClaimRow[],
  historyRows: HistoryRow[]
): StaffClaimsListItem[] {
  const diasporaOriginsByClaimId = mapDiasporaOrigins(historyRows);

  return rows.map(row => {
    const diasporaOriginData = diasporaOriginsByClaimId.get(row.id) ?? null;
    const { status } = resolveClaimLifecycleReadProjection(row);
    return {
      id: row.id,
      claimNumber: (row.claimNumber as string | null) ?? null,
      companyName: (row.companyName as string | null) ?? null,
      title: (row.title as string | null) ?? null,
      status,
      staffId: (row.staffId as string | null) ?? null,
      assigneeName: (row.assigneeName as string | null) ?? null,
      assigneeEmail: (row.assigneeEmail as string | null) ?? null,
      stageLabel: formatStageLabel(status),
      updatedAt: normalizeDate(row.updatedAt as Date | string | null | undefined),
      memberName: (row.memberName as string | undefined) ?? undefined,
      memberNumber: (row.memberNumber as string | null) ?? null,
      isDiasporaOrigin: diasporaOriginData !== null,
      diasporaCountry: diasporaOriginData?.country ?? null,
    };
  });
}
