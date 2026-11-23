import { and, eq, or, type TenantTransaction } from '@interdomestik/database';
import { legalAcceptances, legalDocumentVersions } from '@interdomestik/database/schema';

import { currentLegalVersions } from './current-versions';
import { currentLegalDocuments, type LegalDocument } from './documents';

export type AcceptanceState = { accepted: true } | { accepted: false; missing: LegalDocument[] };

export function matchCurrentLegalVersions(kind: string, version: string): boolean {
  return currentLegalDocuments.some(doc => doc.kind === kind && doc.version === version);
}

export async function getAcceptanceState(
  tx: TenantTransaction,
  { subjectUserId, requireApproved }: { subjectUserId: string; requireApproved: boolean }
): Promise<AcceptanceState> {
  const rows = await tx
    .select({ kind: legalAcceptances.documentKind })
    .from(legalAcceptances)
    .innerJoin(
      legalDocumentVersions,
      and(
        eq(legalAcceptances.documentKind, legalDocumentVersions.kind),
        eq(legalAcceptances.documentVersion, legalDocumentVersions.version),
        eq(legalAcceptances.locale, legalDocumentVersions.locale),
        eq(legalAcceptances.textSha256, legalDocumentVersions.textSha256)
      )
    )
    .where(
      and(
        eq(legalAcceptances.subjectUserId, subjectUserId),
        currentAcceptanceVersions(),
        requireApproved ? eq(legalDocumentVersions.reviewStatus, 'approved') : undefined
      )
    );
  const acceptedKinds = new Set(rows.map(row => row.kind));
  const missing = currentLegalDocuments.filter(doc => !acceptedKinds.has(doc.kind));
  return missing.length ? { accepted: false, missing } : { accepted: true };
}

export function currentAcceptanceVersions() {
  return or(
    and(
      eq(legalAcceptances.documentKind, 'terms'),
      eq(legalAcceptances.documentVersion, currentLegalVersions.terms)
    ),
    and(
      eq(legalAcceptances.documentKind, 'privacy_notice'),
      eq(legalAcceptances.documentVersion, currentLegalVersions.privacy_notice)
    )
  );
}
