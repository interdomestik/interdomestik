import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ locale: string }>;
};

// Agents record member leads from the leads workspace, where the consent notice and attestation
// are part of the dialog (ACQ-1). This older form wrote leads without consent and stays retired.
export default async function NewLeadPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  redirect(`/${locale}/agent/leads`);
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
