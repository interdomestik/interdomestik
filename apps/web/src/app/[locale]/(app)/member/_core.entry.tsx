import { MemberAcceptanceStep } from '@/components/privacy/member-acceptance-step';
import { requireMemberAcceptancePage } from '@/lib/privacy/require-member-acceptance';
import { MemberRoleShell } from '@/components/shell/member-role-shell';
import { toClientShellUser } from '@/components/shell/client-shell-user';
import { NavigationFeedback } from '@/components/shell/navigation-feedback';
import { APP_NAMESPACES, pickMessages } from '@/i18n/messages';
import { getCanonicalRouteForRole } from '@/lib/canonical-routes';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { withMemberActorRoleOnSession } from './actor-role-on-session';

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const admission = await requireMemberAcceptancePage();
  if (!admission.ok) return <MemberAcceptanceStep locale={locale} refusal={admission} />;
  const sessionNonNull = admission.authorized.session;

  const memberSession = withMemberActorRoleOnSession(sessionNonNull);
  const actorRoleOnSession = memberSession.user.role;
  const shellUser = toClientShellUser(memberSession.user);
  const canonical = getCanonicalRouteForRole(actorRoleOnSession, locale);
  if (canonical && actorRoleOnSession !== 'member') {
    redirect(canonical);
    return null;
  }

  // Load app-specific messages for client components
  const allMessages = await getMessages();
  const messages = pickMessages(allMessages, APP_NAMESPACES);

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <NavigationFeedback>
        <div data-testid="dashboard-page-ready">
          <MemberRoleShell user={shellUser}>{children}</MemberRoleShell>
        </div>
      </NavigationFeedback>
    </NextIntlClientProvider>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
