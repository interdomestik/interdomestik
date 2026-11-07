import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ locale: string }>;
};

// Direct member registration is retired (Plan070 ACQ-2, owner D1 a): a member is created only by
// lead conversion after payment. Agents record the lead, with consent, in the leads workspace.
export default async function RegisterMemberPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  redirect(`/${locale}/agent/leads`);
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
