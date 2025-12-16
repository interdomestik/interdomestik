import { auth } from '@/lib/auth';
import { redirect } from '@/i18n/routing';
import { headers } from 'next/headers';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AppProtectedLayout({ children, params }: Props) {
  const { locale } = await params;

  // Enforce authentication for all routes in the (app) group
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect({ href: '/login', locale });
  }

  return children;
}
