import { getTranslations } from 'next-intl/server';
import { CommunicationRetry } from './communication-retry';

export async function RestrictedCommunicationNotice({
  state,
}: {
  state?: 'empty' | 'unavailable' | 'failed';
}) {
  const t = await getTranslations('messaging.branchManager');
  return (
    <div className="space-y-2 text-sm" data-testid="claim-communication-restriction">
      <p>{t('restriction')}</p>
      {state && <p role="status">{t(state)}</p>}
      <CommunicationRetry label={t('retry')} loading={t('loading')} />
    </div>
  );
}
