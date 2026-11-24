'use server';

import { LOCALES } from '@/i18n/locales';
import { verifyLegalAcceptanceFormToken } from '@/lib/privacy/legal-acceptance-form-token';
import { renderLegalTexts } from '@/lib/privacy/legal-text';
import { requireApprovedLegalDocuments } from '@/lib/privacy/require-member-acceptance';
import { actionFailure, defineAction } from '@/lib/safe-action';
import {
  acceptLegalDocuments as recordLegalAcceptance,
  currentLegalVersions,
  legalDocumentKinds,
} from '@interdomestik/domain-privacy/acceptance';
import { z } from 'zod';

const inputSchema = z.strictObject({
  formToken: z.string().min(1).max(4096),
  locale: z.enum(LOCALES),
  documents: z
    .array(
      z.strictObject({ kind: z.enum(legalDocumentKinds), version: z.string().min(1).max(100) })
    )
    .min(1)
    .max(2),
  attestations: z.strictObject({
    termsAccepted: z.literal(true).optional(),
    privacyNoticeAcknowledged: z.literal(true).optional(),
  }),
});

const acceptLegalDocumentsAction = defineAction({
  name: 'privacy.acceptLegalDocuments',
  basis: { kind: 'self' },
  subject: { type: 'self' },
  input: inputSchema,
  async handler(input, { authority, session }) {
    const { formToken, locale, documents, attestations } = input;
    if (documents.some(({ kind, version }) => currentLegalVersions[kind] !== version)) {
      return actionFailure('stale_version');
    }
    const legalTexts = renderLegalTexts(locale, documents);
    if (!legalTexts.ok) return actionFailure(legalTexts.code);
    const mismatch = await verifyLegalAcceptanceFormToken(
      formToken,
      session.user.id,
      locale,
      legalTexts.texts
    );
    if (mismatch) return actionFailure(mismatch);
    const result = await recordLegalAcceptance(
      authority,
      { documents, attestations },
      {
        locale,
        texts: legalTexts.texts,
        requireApproved: requireApprovedLegalDocuments(),
      }
    );
    if (!result.ok) return actionFailure(result.code === 'forbidden' ? 'FORBIDDEN' : result.code);
    return { accepted: true } as const;
  },
});

export async function acceptLegalDocuments(...args: Parameters<typeof acceptLegalDocumentsAction>) {
  return acceptLegalDocumentsAction(...args);
}
