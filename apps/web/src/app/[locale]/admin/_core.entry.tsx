import { AdminSidebar } from '@/components/admin/admin-sidebar';
import type { AdminTenantOption } from '@/components/admin/admin-tenant-selector';
import { AdminTenantSelector } from '@/components/admin/admin-tenant-selector';
import { ADMIN_NAMESPACES, BASE_NAMESPACES, pickMessages } from '@/i18n/messages';
import { auth } from '@/lib/auth';
import { Separator, SidebarInset, SidebarProvider, SidebarTrigger } from '@interdomestik/ui';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export { generateMetadata, generateViewport } from '@/app/_segment-exports';

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await (async () => {
    try {
      return await auth.api.getSession({
        headers: await headers(),
      });
    } catch {
      return null;
    }
  })();

  if (!session) {
    redirect(`/${locale}/login`);
    return null;
  }

  const sessionNonNull = session as NonNullable<typeof session>;

  // Central Portal Guard
  const role = sessionNonNull.user.role;
  console.log(`[AdminLayout] Guard Check | Role: ${role} | Path: ${locale}/admin`);

  // 1. Staff -> 404 Not Found (Strict Isolation)
  if (role === 'staff') {
    const { notFound } = await import('next/navigation');
    notFound();
  }

  // 2. Agent -> 404 Not Found (Strict Isolation)
  if (role === 'agent') {
    const { notFound } = await import('next/navigation');
    notFound();
  }

  // 3. Member -> 404 Not Found (Strict Isolation)
  if (role === 'member') {
    const { notFound } = await import('next/navigation');
    notFound();
  }

  // 4. Default Allow: tenant_admin, super_admin, branch_manager
  // (Branch Manager specific page access is handled deeper, but they can enter "Admin" portal broadly)

  const allMessages = await getMessages();
  const messages = {
    ...pickMessages(allMessages, BASE_NAMESPACES),
    ...pickMessages(allMessages, ADMIN_NAMESPACES),
  };

  const isSuperAdmin = sessionNonNull.user.role === 'super_admin';

  let tenantOptions: AdminTenantOption[] = [];
  if (isSuperAdmin) {
    try {
      const [{ db }, { tenants }, drizzle] = await Promise.all([
        import('@interdomestik/database/db'),
        import('@interdomestik/database/schema'),
        import('drizzle-orm'),
      ]);

      // Keep selector lightweight: only active tenants.
      const rows = await db
        .select({ id: tenants.id, name: tenants.name, countryCode: tenants.countryCode })
        .from(tenants)
        .where(drizzle.eq(tenants.isActive, true))
        .orderBy(drizzle.asc(tenants.name));

      tenantOptions = rows;
    } catch (err) {
      console.error('[AdminLayout] SuperAdmin DB fetch failed:', err);
      // Fallback to empty to prevent 500
      tenantOptions = [];
    }
  }

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <SidebarProvider defaultOpen={true}>
        <AdminSidebar
          user={{
            name: sessionNonNull.user.name || 'Admin',
            email: sessionNonNull.user.email,
            role: sessionNonNull.user.role,
          }}
        />
        <SidebarInset className="bg-mesh flex flex-col min-h-screen">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background/80 backdrop-blur-md sticky top-0 z-30 px-6 transition-all">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
            </div>
            <div className="flex-1 flex items-center justify-between">
              <h1 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Admin Panel
              </h1>
              {isSuperAdmin ? (
                <div className="flex items-center gap-2">
                  <AdminTenantSelector
                    tenants={tenantOptions}
                    defaultTenantId={sessionNonNull.user.tenantId}
                  />
                </div>
              ) : null}
            </div>
          </header>
          {/* SidebarInset renders as <main>, so use <div> here to avoid nested landmarks */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8">
            <div className="container mx-auto">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </NextIntlClientProvider>
  );
}
