import { currentLegalVersions } from './current-versions';

export const legalDocumentKinds = ['terms', 'privacy_notice'] as const;
export type LegalDocumentKind = (typeof legalDocumentKinds)[number];
export type LegalDocument = Readonly<{ kind: LegalDocumentKind; version: string }>;

export const currentLegalDocuments = legalDocumentKinds.map(kind => ({
  kind,
  version: currentLegalVersions[kind],
}));

export function isLegalAcceptanceRole(role: string | null | undefined): boolean {
  return role === 'member' || role === 'user';
}
