import { CommercialDisclaimerNotice } from '@/components/commercial/commercial-disclaimer-notice';
import { generateLocaleStaticParams } from '@/app/_locale-static-params';
import { getSupportContacts } from '@/lib/support-contacts';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

type BusinessMembershipPageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: BusinessMembershipPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricing' });

  return {
    title: `${t('businessLead.title')} - Interdomestik`,
    description: t('businessLead.subtitle'),
  };
}

export default async function BusinessMembershipPage({ params }: BusinessMembershipPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricing' });
  const contacts = getSupportContacts({ locale });

  return (
    <main data-testid="business-membership-page-ready" className="container px-4 py-16 md:px-6">
      <div className="mx-auto max-w-4xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">
          {t('business.name')}
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950">
          {t('businessLead.title')}
        </h1>
        <p className="mt-4 text-lg font-medium text-slate-600">{t('businessLead.subtitle')}</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <a
            href={contacts.telHref}
            className="flex min-h-[44px] touch-manipulation items-center justify-center rounded-2xl bg-primary px-6 py-4 text-base font-black text-white"
          >
            {t('businessLead.callCta')}
          </a>
          <a
            href={contacts.whatsappHref}
            className="flex min-h-[44px] touch-manipulation items-center justify-center rounded-2xl border-2 border-slate-200 px-6 py-4 text-base font-black text-slate-900"
          >
            {t('businessLead.whatsappCta')}
          </a>
        </div>

        <p className="mt-6 text-sm font-semibold text-slate-500">{t('businessLead.note')}</p>

        <div className="mt-8">
          <CommercialDisclaimerNotice
            eyebrow={t('disclaimers.eyebrow')}
            items={[
              {
                title: t('disclaimers.freeStart.title'),
                body: t('disclaimers.freeStart.body'),
              },
            ]}
          />
        </div>
      </div>
    </main>
  );
}

export { generateViewport } from '@/app/_segment-exports';
export const generateStaticParams = generateLocaleStaticParams;
