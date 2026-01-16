import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RegisterMemberForm } from './register-member-form';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function RegisterMemberPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('agent-members.members.register');

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{t('title') || 'Register New Member'}</h1>
        <p className="text-muted-foreground">
          {t('description') || 'Manually register a member and activate their membership.'}
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <RegisterMemberForm />
      </div>
    </div>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
