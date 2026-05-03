import { createMemberSupportHandoff } from '@/actions/support-handoffs/create';
import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { Link } from '@/i18n/routing';
import { getCanonicalRouteForRole } from '@/lib/canonical-routes';
import { claims, db, desc, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { Button } from '@interdomestik/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui/components/card';
import { Mail, MessageSquare, Phone } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

export { generateMetadata, generateViewport } from '@/app/_segment-exports';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function getMemberClaimOptions(args: { memberId: string; tenantId: string }) {
  return db
    .select({
      id: claims.id,
      claimNumber: claims.claimNumber,
      title: claims.title,
      status: claims.status,
      createdAt: claims.createdAt,
    })
    .from(claims)
    .where(withTenant(args.tenantId, claims.tenantId, eq(claims.userId, args.memberId)))
    .orderBy(desc(claims.createdAt))
    .limit(10);
}

export default async function HelpPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('help');
  const session = requireSessionOrRedirect(await getSessionSafe('MemberHelpPage'), locale);
  if (session.user.role !== 'member' && session.user.role !== 'user') {
    redirect(getCanonicalRouteForRole(session.user.role, locale) ?? `/${locale}/member`);
  }
  const claimOptions =
    session.user.tenantId && session.user.id
      ? await getMemberClaimOptions({
          memberId: session.user.id,
          tenantId: session.user.tenantId,
        })
      : [];
  const status = getSingleParam((await searchParams).support);

  return (
    <div
      className="flex h-full max-w-4xl flex-col space-y-8 p-8 mx-auto"
      data-testid="member-page-ready"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-2">{t('description')}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Direct Contact */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t('contact.title')}</CardTitle>
            <CardDescription>{t('contact.description')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <Button variant="outline" className="h-24 flex-col gap-2" asChild>
              <a href="tel:+38349900600">
                <Phone className="h-6 w-6" />
                <span className="font-semibold text-lg">049 900 600</span>
                <span className="text-xs text-muted-foreground">{t('contact.callUs')}</span>
              </a>
            </Button>

            <Button variant="outline" className="h-24 flex-col gap-2" asChild>
              <a href="mailto:info@interdomestik.com">
                <Mail className="h-6 w-6" />
                <span className="font-semibold text-lg">{t('contact.emailUs')}</span>
                <span className="text-xs text-muted-foreground">info@interdomestik.com</span>
              </a>
            </Button>

            <Button variant="outline" className="h-24 flex-col gap-2" asChild>
              <a href="https://wa.me/38349900600" target="_blank" rel="noopener noreferrer">
                <MessageSquare className="h-6 w-6 text-green-600" />
                <span className="font-semibold text-lg">WhatsApp</span>
                <span className="text-xs text-muted-foreground">{t('contact.chatWithUs')}</span>
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2" data-testid="member-support-handoff-card">
          <CardHeader>
            <CardTitle>{t('request.title')}</CardTitle>
            <CardDescription>{t('request.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {status === 'created' ? (
              <div
                className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900"
                data-testid="member-support-handoff-created"
              >
                {t('request.created')}
              </div>
            ) : null}
            {status === 'error' ? (
              <div
                className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900"
                data-testid="member-support-handoff-error"
              >
                {t('request.error')}
              </div>
            ) : null}
            <form
              action={createMemberSupportHandoff}
              className="space-y-4"
              data-testid="member-support-handoff-form"
            >
              <input type="hidden" name="locale" value={locale} />
              <div className="space-y-2">
                <label htmlFor="support-subject" className="text-sm font-medium">
                  {t('request.subject')}
                </label>
                <input
                  id="support-subject"
                  name="subject"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  maxLength={120}
                  required
                  data-testid="member-support-handoff-subject"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="support-message" className="text-sm font-medium">
                  {t('request.message')}
                </label>
                <textarea
                  id="support-message"
                  name="message"
                  className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  maxLength={2000}
                  required
                  data-testid="member-support-handoff-message"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="support-contact-preference" className="text-sm font-medium">
                    {t('request.contactPreference')}
                  </label>
                  <select
                    id="support-contact-preference"
                    name="contactPreference"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    defaultValue="staff_reply"
                    data-testid="member-support-handoff-contact-preference"
                  >
                    <option value="staff_reply">{t('request.contact.staff_reply')}</option>
                    <option value="phone">{t('request.contact.phone')}</option>
                    <option value="email">{t('request.contact.email')}</option>
                    <option value="whatsapp">{t('request.contact.whatsapp')}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="support-claim" className="text-sm font-medium">
                    {t('request.claim')}
                  </label>
                  <select
                    id="support-claim"
                    name="claimId"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    defaultValue=""
                    data-testid="member-support-handoff-claim"
                  >
                    <option value="">{t('request.noClaim')}</option>
                    {claimOptions.map(claim => (
                      <option key={claim.id} value={claim.id}>
                        {claim.claimNumber || claim.title || claim.id}
                        {claim.status ? ` (${claim.status})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Button type="submit" data-testid="member-support-handoff-submit">
                {t('request.submit')}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* FAQ Links (Placeholder) */}
        <Card>
          <CardHeader>
            <CardTitle>{t('faq.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-medium text-sm">{t('faq.q1.question')}</h3>
              <p className="text-sm text-muted-foreground">{t('faq.q1.answer')}</p>
            </div>
            <div>
              <h3 className="font-medium text-sm">{t('faq.q2.question')}</h3>
              <p className="text-sm text-muted-foreground">{t('faq.q2.answer')}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('legal.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="link" className="px-0 h-auto" asChild>
              <Link href="/member/rights">{t('legal.consumerRights')} &rarr;</Link>
            </Button>
            <div className="text-sm text-muted-foreground">{t('legal.consumerRightsDesc')}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
