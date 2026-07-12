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
      ...item,
      updatedAt: item.updatedAt?.toISOString() ?? null,
      consentRecordedAt: item.consentRecordedAt?.toISOString() ?? null,
    })),
  };
}
