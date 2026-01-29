import { MessagingPanel } from '@/components/messaging/messaging-panel';
import { ClaimDocumentsList } from '@/features/claims/tracking/components/ClaimDocumentsList';
import { ClaimTimeline } from '@/features/claims/tracking/components/ClaimTimeline';
import { ClaimTrackingHeader } from '@/features/claims/tracking/components/ClaimTrackingHeader';
import { getMemberClaimDetail } from '@/features/claims/tracking/server/getMemberClaimDetail';
import { auth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

export async function MemberClaimDetailV2Page({ id, locale }: { id: string; locale: string }) {
  setRequestLocale(locale);

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect(`/${locale}/login?callbackUrl=/${locale}/member/claims/${id}`);
  }

  // Use new feature loader
  const trackingData = await getMemberClaimDetail(session, id);

  if (!trackingData) {
    // If not found or access denied, returning notFound() is safer than redirecting blindly
    return notFound();
  }

  const { timeline, documents, ...claim } = trackingData;
  const t = await getTranslations('claims');

  return (
    <div className="flex flex-col h-full space-y-8 p-4 md:p-8 max-w-5xl mx-auto">
      {/* Tracking Header with Status & Share Button */}
      <ClaimTrackingHeader
        claimId={claim.id}
        title={claim.title}
        status={claim.status}
        canShare={trackingData.canShare}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Details Card */}
          <Card>
            <CardHeader>
              <CardTitle>{t('detail.caseDetails')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-medium text-sm text-muted-foreground mb-1">
                  {t('detail.description')}
                </h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {claim.description || '—'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground mb-1">
                    {t('table.company')}
                  </h3>
                  <p className="font-medium">—</p>
                </div>
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground mb-1">
                    {t('table.amount')}
                  </h3>
                  <p className="font-medium">
                    {claim.amount ? `${claim.amount} ${claim.currency}` : '—'}
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground mb-1">
                    {t('detail.category')}
                  </h3>
                  <p className="capitalize">General</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Evidence/Documents */}
          <Card>
            <CardHeader>
              <CardTitle>{t('detail.evidence')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ClaimDocumentsList documents={documents} />
            </CardContent>
          </Card>

          {/* Messaging Panel for desktop */}
          <div className="hidden lg:block">
            <MessagingPanel
              claimId={claim.id}
              currentUser={{
                id: session.user.id,
                name: session.user.name,
                image: session.user.image ?? null,
                role: session.user.role || 'member',
              }}
              isAgent={false}
            />
          </div>
        </div>

        {/* Sidebar: Timeline */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle data-testid="claim-timeline-title">{t('timeline.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ClaimTimeline events={timeline} />
            </CardContent>
          </Card>

          {/* Messaging Mobile */}
          <div className="lg:hidden">
            <MessagingPanel
              claimId={claim.id}
              currentUser={{
                id: session.user.id,
                name: session.user.name,
                image: session.user.image ?? null,
                role: session.user.role || 'member',
              }}
              isAgent={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
