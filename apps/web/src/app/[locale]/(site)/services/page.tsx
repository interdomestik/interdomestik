import { contactInfo } from '@/lib/contact';
import { buildCoverageMatrixProps } from '@/components/commercial/coverage-matrix-content';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
export { generateLocaleStaticParams as generateStaticParams } from '@/app/_locale-static-params';

import { getServicesPageContactModel } from './_core';
import { ServicesPageSections } from './_sections';

interface ServicesPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: ServicesPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'servicesPage.meta' });

  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function ServicesPage({ params }: ServicesPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'servicesPage' });
  const coverageMatrix = await getTranslations({ locale, namespace: 'coverageMatrix' });
  const contact = getServicesPageContactModel(contactInfo);

  return (
    <ServicesPageSections
      t={t}
      contact={contact}
      coverageMatrix={buildCoverageMatrixProps(coverageMatrix, 'services-coverage-matrix')}
    />
  );
}
