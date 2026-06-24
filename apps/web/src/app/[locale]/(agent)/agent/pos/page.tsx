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

  // Phase C pilot: POS is an entrypoint only. Canonical enrollment lives at /agent/clients/new.
  redirect(`/${locale}/agent/clients/new?mode=pos`);
}
