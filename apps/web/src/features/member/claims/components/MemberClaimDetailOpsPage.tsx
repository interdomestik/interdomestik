'use client';

import { OpsActionBar, OpsDocumentsPanel, OpsTimeline } from '@/components/ops';
import {
  getClaimActions,
  OpsActionConfig,
  toOpsDocuments,
  toOpsTimelineEvents,
} from '@/components/ops/adapters/claims';
import { ClaimMessenger } from '@/components/shared/claim-messenger';
import { ClaimTrackingHeader } from '@/features/claims/tracking/components/ClaimTrackingHeader';
import type { ClaimTrackingDetailDto } from '@/features/claims/tracking/types';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ClaimEvidenceUploadDialog } from './ClaimEvidenceUploadDialog';

interface MemberClaimDetailOpsPageProps {
  claim: ClaimTrackingDetailDto;
  userId: string;
}

export function MemberClaimDetailOpsPage({ claim, userId }: MemberClaimDetailOpsPageProps) {
  const t = useTranslations('claims');

  // Transform events and translate titles
  const opsEvents = toOpsTimelineEvents(claim.timeline).map(e => ({
    ...e,
    title: t(e.title), // Translate the labelKey
  }));

  const opsDocuments = toOpsDocuments(claim.documents);

  // Policy-driven actions
  const { secondary } = getClaimActions(claim, t);

  const handleAction = (id: string) => {
    // 10C: Safe wiring
    console.log('[Claim Action]', id, claim.id);
  };

  const mapAction = (config: OpsActionConfig) => ({
    ...config,
    onClick: () => handleAction(config.id),
  });

  const secondaryActions = secondary.map(mapAction);

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-8">
      <ClaimTrackingHeader
        claimId={claim.id}
        title={claim.title}
        status={claim.status}
        canShare={claim.canShare}
      />

      <OpsActionBar secondary={secondaryActions} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('detail.caseDetails')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{claim.description}</p>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <span className="text-xs text-muted-foreground uppercase">
                    {t('table.amount')}
                  </span>
                  <p className="font-medium">
                    {claim.amount} {claim.currency}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <OpsDocumentsPanel
            title={t('detail.evidence')}
            documents={opsDocuments}
            emptyLabel="No documents uploaded"
            viewLabel="View"
            headerActions={
              <ClaimEvidenceUploadDialog
                claimId={claim.id}
                trigger={
                  <Button size="sm" variant="outline">
                    <Upload className="w-4 h-4 mr-2" /> Upload
                  </Button>
                }
              />
            }
          />

          <div className="mt-8">
            <ClaimMessenger claimId={claim.id} currentUserId={userId} userRole="user" />
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div data-testid="claim-timeline">
            <OpsTimeline
              title={t('timeline.title')}
              events={opsEvents}
              emptyLabel="No history yet"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
