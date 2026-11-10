import { NoteFreeStatusTimeline } from '@/features/claims/communication/note-free-status-timeline';
import { getTranslations } from 'next-intl/server';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { getNoteFreeClaimTimeline } from './get-note-free-claim-timeline';
import { RestrictedCommunicationNotice } from './restricted-communication-notice';

export async function BranchManagerStatusHistory({
  claimId,
  authority,
}: {
  claimId: string;
  authority: TenantAuthority;
}) {
  const result = await getNoteFreeClaimTimeline({
    claimId,
    authority,
    publicOnly: true,
    excludeDraft: true,
  });
  const t = await getTranslations('messaging.branchManager');
  return (
    <section
      id="staff-status-history"
      aria-label={t('history')}
      className="space-y-3 rounded-lg border p-4"
      data-testid="staff-status-history"
    >
      <h2 className="font-semibold">{t('history')}</h2>
      <RestrictedCommunicationNotice
        state={result.kind !== 'ok' ? result.kind : result.data.length === 0 ? 'empty' : undefined}
      />
      {result.kind === 'ok' && <NoteFreeStatusTimeline entries={result.data} />}
    </section>
  );
}
