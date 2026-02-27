import { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.privacy' });
  return {
    title: t('title'),
  };
}

export default function PrivacyPage() {
  const t = useTranslations('legal.privacy');

  return (
    <div className="container py-20 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>
      <div className="prose dark:prose-invert">
        <p>
          Your privacy is important to us. Included in your membership is strict data protection.
        </p>
        <h2>How we handle your data</h2>
        <p>
          We collect only the information required to provide membership services, process claims,
          and comply with legal obligations. Access is restricted by role and tenant scope.
        </p>

        <h2>Your rights</h2>
        <p>
          You can request access to your stored data, request correction, and request deletion where
          legally permitted.
        </p>

        <h2>Deletion requests</h2>
        <p>
          Authenticated users can submit a deletion request using
          <code> POST /api/privacy/data-deletion</code> with an optional JSON body:
          <code>{` { "reason": "..." } `}</code>.
        </p>
        <p>
          Requests are logged as compliance events and reviewed by operations before irreversible
          deletion actions are performed.
        </p>
      </div>
    </div>
  );
}

export { generateViewport } from '@/app/_segment-exports';
