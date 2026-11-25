import { and, eq, or, type TenantTransaction } from '@interdomestik/database';
import { legalDocumentVersions } from '@interdomestik/database/schema';

import { digestLegalDocument } from './digest';
import { currentLegalDocuments, type LegalDocument, type LegalDocumentKind } from './documents';
import { currentLegalVersions } from './current-versions';

export type RenderedLegalText = LegalDocument & { values: readonly string[] };
export type LegalTextFailure = 'legal_text_mismatch' | 'legal_text_not_approved';

export async function verifyLegalTexts(
  tx: TenantTransaction,
  input: { locale: string; texts: readonly RenderedLegalText[]; requireApproved: boolean }
) {
  const rows = await tx
    .select({
      kind: legalDocumentVersions.kind,
      digest: legalDocumentVersions.textSha256,
      status: legalDocumentVersions.reviewStatus,
    })
    .from(legalDocumentVersions)
    .where(
      and(
        eq(legalDocumentVersions.locale, input.locale),
        or(
          and(
            eq(legalDocumentVersions.kind, 'terms'),
            eq(legalDocumentVersions.version, currentLegalVersions.terms)
          ),
          and(
            eq(legalDocumentVersions.kind, 'privacy_notice'),
            eq(legalDocumentVersions.version, currentLegalVersions.privacy_notice)
          )
        )
      )
    );

  const registry = new Map(rows.map(row => [row.kind, row]));
  if (
    input.requireApproved &&
    currentLegalDocuments.some(({ kind }) => registry.get(kind)?.status === 'legal_review_pending')
  ) {
    return { ok: false, code: 'legal_text_not_approved' } as const;
  }
  if (registry.size !== currentLegalDocuments.length) {
    return { ok: false, code: 'legal_text_mismatch' } as const;
  }

  const digests = new Map<LegalDocumentKind, string>();
  for (const text of input.texts) {
    const digest = digestLegalDocument(text.values);
    if (
      text.version !== currentLegalVersions[text.kind] ||
      digest !== registry.get(text.kind)?.digest
    ) {
      return { ok: false, code: 'legal_text_mismatch' } as const;
    }
    digests.set(text.kind, digest);
  }
  return {
    ok: true,
    digests,
    pending: currentLegalDocuments
      .filter(({ kind }) => registry.get(kind)?.status === 'legal_review_pending')
      .map(({ kind }) => kind),
  } as const;
}
