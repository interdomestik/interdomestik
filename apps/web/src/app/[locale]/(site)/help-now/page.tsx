import { HelpNowExperience } from '@/features/help-now/help-now-experience';
import { getHelpNowContentLocale } from '@/features/help-now/content-packs';
import { getHelpNowCopy } from '@/features/help-now/copy';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
export { generateLocaleStaticParams as generateStaticParams } from '@/app/_locale-static-params';

type HelpNowPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: HelpNowPageProps): Promise<Metadata> {
  const { locale } = await params;
  const copy = getHelpNowCopy(getHelpNowContentLocale(locale));

  return {
    title: `${copy.title} | Interdomestik`,
    description: copy.subtitle,
  };
}

export default async function HelpNowPage({ params }: HelpNowPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <HelpNowExperience locale={locale} />;
}
