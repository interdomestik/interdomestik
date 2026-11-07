import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AgentPOSPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.role !== 'agent') {
    redirect(`/${locale}/member`);
  }

  // POS is an entrypoint only. Enrollment starts as a lead with consent; the member is created on
  // conversion after payment (Plan070 ACQ-2, owner D1 a).
  redirect(`/${locale}/agent/leads`);
}
