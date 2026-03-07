import { parseMemberNumber } from './member-number';

const LEGACY_ALLOWED_PATTERNS = [/^PILOT-PR-\d{6}$/];

export type MemberNumberState = 'missing' | 'canonical' | 'legacy_allowed' | 'malformed';

export interface MemberNumberAuditRow {
  id: string;
  createdAt: Date;
  memberNumber: string | null;
}

export interface MemberNumberAuditSummary {
  counts: {
    missing: number;
    canonical: number;
    legacyAllowed: number;
    malformed: number;
  };
  backfillCandidates: MemberNumberAuditRow[];
  repairable: MemberNumberAuditRow[];
}

export function classifyMemberNumber(memberNumber: string | null | undefined): MemberNumberState {
  if (!memberNumber) {
    return 'missing';
  }

  if (parseMemberNumber(memberNumber)) {
    return 'canonical';
  }

  if (LEGACY_ALLOWED_PATTERNS.some(pattern => pattern.test(memberNumber))) {
    return 'legacy_allowed';
  }

  return 'malformed';
}

export function auditMemberNumbers(rows: MemberNumberAuditRow[]): MemberNumberAuditSummary {
  const summary: MemberNumberAuditSummary = {
    counts: {
      missing: 0,
      canonical: 0,
      legacyAllowed: 0,
      malformed: 0,
    },
    backfillCandidates: [],
    repairable: [],
  };

  for (const row of rows) {
    const state = classifyMemberNumber(row.memberNumber);

    if (state === 'missing') {
      summary.counts.missing++;
      summary.backfillCandidates.push(row);
      continue;
    }

    if (state === 'canonical') {
      summary.counts.canonical++;
      continue;
    }

    if (state === 'legacy_allowed') {
      summary.counts.legacyAllowed++;
      continue;
    }

    summary.counts.malformed++;
    summary.repairable.push(row);
  }

  return summary;
}
