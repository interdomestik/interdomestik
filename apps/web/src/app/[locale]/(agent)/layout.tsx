import { redirect } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import Link from 'next/link';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AgentLayout({ children, params }: Props) {
  const { locale } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect({ href: '/login', locale });
    return null;
  }

  // RBAC: Allow 'agent' and 'admin'
  if (session.user.role !== 'agent' && session.user.role !== 'admin') {
    redirect({ href: '/dashboard', locale });
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/10">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center">
          <div className="mr-4 hidden md:flex">
            <Link href="/" className="mr-6 flex items-center space-x-2">
              <span className="hidden font-bold sm:inline-block">
                Interdomestik <span className="text-primary">Agent</span>
              </span>
            </Link>
            <nav className="flex items-center space-x-6 text-sm font-medium">
              <Link
                href="/agent"
                className="transition-colors hover:text-foreground/80 text-foreground"
              >
                Dashboard
              </Link>
              <Link
                href="/agent/claims"
                className="transition-colors hover:text-foreground/80 text-foreground/60"
              >
                Claims
              </Link>
            </nav>
          </div>
          <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
            <div className="w-full flex-1 md:w-auto md:flex-none">{/* Search placeholder */}</div>
            <div className="text-xs text-muted-foreground mr-4">
              {session.user.email} ({session.user.role})
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 container py-6">{children}</main>
    </div>
  );
}
