import type { VaultConsentDisplay, VaultConsentDisplayItem } from '@interdomestik/domain-claims';

type SerializedVaultConsentDisplayItem = Omit<
  VaultConsentDisplayItem,
  'updatedAt' | 'consentRecordedAt'
> & {
  updatedAt: string | null;
  consentRecordedAt: string | null;
};

export type SerializedVaultConsentDisplay =
  | { kind: 'hidden' }
  | { kind: 'subject_erased' }
  | { kind: 'ready'; items: SerializedVaultConsentDisplayItem[] };

export function serializeMemberVaultConsentDisplay(
  display: VaultConsentDisplay
): SerializedVaultConsentDisplay {
  if (display.kind !== 'ready') return display;
  return {
    kind: 'ready',
    items: display.items.map(item => ({
      category: item.category,
      updatedAt: item.updatedAt?.toISOString() ?? null,
      consentStatus: item.consentStatus,
      consentRecordedAt: item.consentRecordedAt?.toISOString() ?? null,
      consentVersion: item.consentVersion,
    })),
  };
}
