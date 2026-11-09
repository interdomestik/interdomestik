'use client';

import { Button } from '@interdomestik/ui/components/button';
import { useTranslations } from 'next-intl';

export function SponsorLoading(): React.JSX.Element {
  const t = useTranslations('sponsors');
  return <output className="block p-6">{t('loading')}</output>;
}

export function SponsorError({ reset }: Readonly<{ reset: () => void }>): React.JSX.Element {
  const t = useTranslations('sponsors');
  return (
    <div role="alert" className="p-6 space-y-3">
      <p>{t('errors.unavailable')}</p>
      <Button onClick={reset}>{t('retry')}</Button>
    </div>
  );
}

export function SponsorNotFound(): React.JSX.Element {
  const t = useTranslations('sponsors');
  return <p className="p-6">{t('errors.not_found')}</p>;
}
