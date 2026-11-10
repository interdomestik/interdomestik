import { getTranslations } from 'next-intl/server';
import { CommunicationRetry } from './communication-retry';

export async function RestrictedCommunicationNotice({
  state,
}: Readonly<{
  state?: 'empty' | 'unavailable' | 'failed';
}>) {
  const t = await getTranslations('messaging.branchManager');
  return (
    <div className="space-y-2 text-sm" data-testid="claim-communication-restriction">
      <p>{t('restriction')}</p>
      {state && (
        <output aria-live="polite" aria-atomic="true" className="block">
          {t(state)}
        </output>
      )}
      <CommunicationRetry label={t('retry')} loading={t('loading')} />
    </div>
  );
}
