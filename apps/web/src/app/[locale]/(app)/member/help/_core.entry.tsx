import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { Link } from '@/i18n/routing';
import { getCanonicalRouteForRole } from '@/lib/canonical-routes';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
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

import { AdvisoryBanner } from './_advisory-banner';
import { getMemberClaimOptions } from './_member-claim-options';
import { PublicResponseBanner } from './_public-response-banner';
import { MemberSupportHandoffForm } from './_support-handoff-form';

export { generateMetadata, generateViewport } from '@/app/_segment-exports';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HelpPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('help');
  const session = requireSessionOrRedirect(await getSessionSafe('MemberHelpPage'), locale);
  if (session.user.role !== 'member' && session.user.role !== 'user') {
    redirect(getCanonicalRouteForRole(session.user.role, locale) ?? `/${locale}/member`);
  }
  const resolvedSearchParams = await searchParams;
  const status = getSingleParam(resolvedSearchParams.support);
  const requestedHandoffId = getSingleParam(resolvedSearchParams.handoffId);
  const requestedClaimId = getSingleParam(resolvedSearchParams.claimId);
  const sourceHint = getSingleParam(resolvedSearchParams.source);
  const authorized =
    session.user.tenantId && session.user.id ? await authorizeSessionTenant() : null;
  const claimOptions = authorized
    ? await getMemberClaimOptions({
        memberId: session.user.id,
        requestedClaimId,
        authority: authorized.authority,
      })
    : [];
  const selectedClaim = requestedClaimId
    ? (claimOptions.find(claim => claim.id === requestedClaimId) ?? null)
    : null;
  const sourceClaimId =
    sourceHint === 'member_claim_detail' && selectedClaim ? selectedClaim.id : null;

  return (
    <div
      className="flex h-full min-w-0 max-w-4xl flex-col space-y-8 p-8 mx-auto [overflow-wrap:anywhere]"
      data-testid="member-page-ready"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-2">{t('description')}</p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2">
        {/* Direct Contact */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t('contact.title')}</CardTitle>
            <CardDescription>{t('contact.description')}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3">
            <Button
              variant="outline"
              className="h-auto min-h-24 min-w-0 max-w-full flex-col gap-2 whitespace-normal md:h-24"
              asChild
            >
              <a href="tel:+38349900600">
                <Phone className="h-6 w-6 shrink-0" />
                <span className="font-semibold text-lg">049 900 600</span>
                <span className="text-xs text-muted-foreground">{t('contact.callUs')}</span>
              </a>
            </Button>

            <Button
              variant="outline"
              className="h-auto min-h-24 min-w-0 max-w-full flex-col gap-2 whitespace-normal md:h-24"
              asChild
            >
              <a href="mailto:info@interdomestik.com">
                <Mail className="h-6 w-6 shrink-0" />
                <span className="font-semibold text-lg">{t('contact.emailUs')}</span>
                <span className="text-xs text-muted-foreground">info@interdomestik.com</span>
              </a>
            </Button>

            <Button
              variant="outline"
              className="h-auto min-h-24 min-w-0 max-w-full flex-col gap-2 whitespace-normal md:h-24"
              asChild
            >
              <a href="https://wa.me/38349900600" target="_blank" rel="noopener noreferrer">
                <MessageSquare className="h-6 w-6 shrink-0 text-green-600" />
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
            {selectedClaim ? (
              <div
                className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-950"
                data-testid="member-support-handoff-claim-context"
              >
                <div className="text-xs font-medium uppercase text-sky-700">
                  {t('request.claimContextTitle')}
                </div>
                <div
                  className="mt-1 font-semibold"
                  data-testid="member-support-handoff-claim-title"
                >
                  {selectedClaim.claimNumber || selectedClaim.title || selectedClaim.id}
                </div>
                <div
                  className="mt-1 text-xs text-sky-800"
                  data-testid="member-support-handoff-claim-status"
                >
                  {t('request.claimContextStatus', {
                    status: selectedClaim.status ?? 'unknown',
                  })}
                </div>
              </div>
            ) : null}
            {authorized ? (
              <>
                <PublicResponseBanner
                  authority={authorized.authority}
                  handoffId={requestedHandoffId ?? null}
                  locale={locale}
                  memberId={session.user.id}
                  selectedClaim={selectedClaim}
                />
                <AdvisoryBanner
                  authority={authorized.authority}
                  memberId={session.user.id}
                  selectedClaim={selectedClaim}
                />
              </>
            ) : null}
            <MemberSupportHandoffForm
              claimOptions={claimOptions}
              labels={{
                claim: t('request.claim'),
                contactPreference: t('request.contactPreference'),
                contactPreferenceEmail: t('request.contact.email'),
                contactPreferencePhone: t('request.contact.phone'),
                contactPreferenceStaffReply: t('request.contact.staff_reply'),
                contactPreferenceWhatsApp: t('request.contact.whatsapp'),
                message: t('request.message'),
                noClaim: t('request.noClaim'),
                subject: t('request.subject'),
                submit: t('request.submit'),
              }}
              locale={locale}
              selectedClaimId={selectedClaim?.id ?? null}
              sourceClaimId={sourceClaimId}
            />
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
            <Button
              variant="link"
              className="h-auto min-w-0 max-w-full whitespace-normal px-0 text-left"
              asChild
            >
              <Link href="/member/rights">{t('legal.consumerRights')} &rarr;</Link>
            </Button>
            <div className="text-sm text-muted-foreground">{t('legal.consumerRightsDesc')}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
