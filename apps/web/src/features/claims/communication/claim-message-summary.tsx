import { getFormatter, getTranslations } from 'next-intl/server';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { getClaimMessageMetadata } from './get-claim-message-metadata';
import { RestrictedCommunicationNotice } from './restricted-communication-notice';

export async function ClaimMessageSummary({
  claimId,
  authority,
}: Readonly<{
  claimId: string;
  authority: TenantAuthority;
}>) {
  const result = await getClaimMessageMetadata({ claimId, authority });
  const t = await getTranslations('messaging.branchManager');
  const format = await getFormatter();
  let state: 'empty' | 'unavailable' | 'failed' | undefined;
  if (result.kind !== 'ok') state = result.kind;
  else if (result.data.count === 0) state = 'empty';
  return (
    <section
      className="min-w-0 space-y-3 rounded-lg border p-4"
      aria-label={t('title')}
      data-testid="claim-message-summary"
    >
      <h2 className="font-semibold">{t('title')}</h2>
      <RestrictedCommunicationNotice state={state} />
      {result.kind === 'ok' && (
        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt>{t('count')}</dt>
            <dd data-testid="claim-message-summary-count">{result.data.count}</dd>
          </div>
          <div>
            <dt>{t('lastMessageAt')}</dt>
            <dd data-testid="claim-message-summary-last">
              {result.data.lastMessageAt
                ? format.dateTime(new Date(result.data.lastMessageAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : t('noTimestamp')}
            </dd>
          </div>
          <div>
            <dt>{t('awaitingReply')}</dt>
            <dd data-testid="claim-message-summary-awaiting">
              {t(result.data.awaitingReply ? 'yes' : 'no')}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
