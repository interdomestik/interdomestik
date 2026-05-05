import { createMemberSupportHandoff } from '@/actions/support-handoffs/create';
import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { Link } from '@/i18n/routing';
import { getCanonicalRouteForRole } from '@/lib/canonical-routes';
import { and, claims, db, desc, eq } from '@interdomestik/database';
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

import { AdvisoryBanner } from './_advisory-banner';
import { PublicResponseBanner } from './_public-response-banner';

export { generateMetadata, generateViewport } from '@/app/_segment-exports';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

type MemberClaimOption = {
  id: string;
  claimNumber: string | null;
  title: string | null;
  status: string | null;
  createdAt: Date | null;
};

const memberClaimOptionSelection = {
  id: claims.id,
  claimNumber: claims.claimNumber,
  title: claims.title,
  status: claims.status,
  createdAt: claims.createdAt,
};

async function getMemberClaimOptions(args: {
  memberId: string;
  tenantId: string;
  requestedClaimId?: string | null;
}): Promise<MemberClaimOption[]> {
  const recentClaims = await db
    .select({
      ...memberClaimOptionSelection,
    })
    .from(claims)
    .where(withTenant(args.tenantId, claims.tenantId, eq(claims.userId, args.memberId)))
    .orderBy(desc(claims.createdAt))
    .limit(10);

  if (!args.requestedClaimId || recentClaims.some(claim => claim.id === args.requestedClaimId)) {
    return recentClaims;
  }

  const requestedClaims = await db
    .select({
      ...memberClaimOptionSelection,
    })
    .from(claims)
    .where(
      withTenant(
        args.tenantId,
        claims.tenantId,
        and(eq(claims.userId, args.memberId), eq(claims.id, args.requestedClaimId))
      )
    )
    .limit(1);

  return requestedClaims.length > 0 ? [...recentClaims, requestedClaims[0]] : recentClaims;
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
  const claimOptions =
    session.user.tenantId && session.user.id
      ? await getMemberClaimOptions({
          memberId: session.user.id,
          requestedClaimId,
          tenantId: session.user.tenantId,
        })
      : [];
  const selectedClaim = requestedClaimId
    ? (claimOptions.find(claim => claim.id === requestedClaimId) ?? null)
    : null;
  const sourceClaimId =
    sourceHint === 'member_claim_detail' && selectedClaim ? selectedClaim.id : null;

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
            {session.user.tenantId && session.user.id ? (
              <>
                <PublicResponseBanner
                  handoffId={requestedHandoffId ?? null}
                  memberId={session.user.id}
                  selectedClaim={selectedClaim}
                  tenantId={session.user.tenantId}
                />
                <AdvisoryBanner
                  memberId={session.user.id}
                  selectedClaim={selectedClaim}
                  tenantId={session.user.tenantId}
                />
              </>
            ) : null}
            <form
              action={createMemberSupportHandoff}
              className="space-y-4"
              data-testid="member-support-handoff-form"
            >
              <input type="hidden" name="locale" value={locale} />
              <input
                type="hidden"
                name="source"
                value={sourceClaimId ? 'member_claim_detail' : 'member_help'}
              />
              {sourceClaimId ? (
                <input type="hidden" name="sourceClaimId" value={sourceClaimId} />
              ) : null}
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
                    defaultValue={selectedClaim?.id ?? ''}
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
