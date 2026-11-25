import 'server-only';

import {
  digestLegalDocument,
  type RenderedLegalText,
} from '@interdomestik/domain-privacy/acceptance';
import { signJWT, verifyJWT } from 'better-auth/crypto';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const purpose = 'member-legal-acceptance';
const ttlSeconds = 15 * 60;
const payloadSchema = z.object({
  purpose: z.literal(purpose),
  sub: z.string(),
  locale: z.string(),
  documents: z.string(),
  exp: z.number(),
});

async function authContext() {
  const { auth } = await import('@/lib/auth');
  return auth.$context;
}

function documentEvidence(texts: readonly RenderedLegalText[]) {
  return JSON.stringify(
    texts.map(({ kind, version, values }) => [kind, version, digestLegalDocument(values)])
  );
}

export async function issueLegalAcceptanceFormToken(
  userId: string,
  locale: string,
  texts: readonly RenderedLegalText[]
) {
  const { secret } = await authContext();
  return signJWT(
    { purpose, sub: userId, locale, documents: documentEvidence(texts), jti: randomUUID() },
    secret,
    ttlSeconds
  );
}

export async function verifyLegalAcceptanceFormToken(
  token: string,
  userId: string,
  locale: string,
  texts: readonly RenderedLegalText[]
) {
  const { secret } = await authContext();
  const result = payloadSchema.safeParse(await verifyJWT(token, secret));
  if (!result.success) return 'stale_version';
  if (
    result.data.sub !== userId ||
    result.data.locale !== locale ||
    result.data.documents !== documentEvidence(texts)
  )
    return 'legal_text_mismatch';
  return null;
}
