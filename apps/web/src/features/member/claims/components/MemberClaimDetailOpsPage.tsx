'use client';

import { OpsActionBar, OpsDocumentsPanel, OpsStatusBadge, OpsTimeline } from '@/components/ops';
import {
  getClaimActions,
  OpsActionConfig,
  toOpsDocuments,
  toOpsStatus,
  toOpsTimelineEvents,
} from '@/components/ops/adapters/claims';
import type { ClaimTrackingDetailDto } from '@/features/claims/tracking/types';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ClaimEvidenceUploadDialog } from './ClaimEvidenceUploadDialog';

interface MemberClaimDetailOpsPageProps {
  claim: ClaimTrackingDetailDto;
}

export function MemberClaimDetailOpsPage({ claim }: MemberClaimDetailOpsPageProps) {
  const t = useTranslations('claims');
  const tTrackingStatus = useTranslations('claims-tracking.status');

  // Transform events and translate titles
  const opsEvents = toOpsTimelineEvents(claim.timeline).map(e => ({
    ...e,
    // claim.timeline labelKey is a fully qualified key (e.g. "claims-tracking.status.evaluation").
    // Translating it within the "claims" namespace causes missing-message errors in production.
    title: e.title.startsWith('claims-tracking.status.')
      ? tTrackingStatus(e.title.replace('claims-tracking.status.', ''))
      : e.title,
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
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">{claim.title}</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-muted-foreground text-sm">{claim.id}</span>
            <OpsStatusBadge {...toOpsStatus(claim.status)} />
          </div>
        </div>
        <OpsActionBar secondary={secondaryActions} />
      </div>

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
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <OpsTimeline title={t('timeline.title')} events={opsEvents} emptyLabel="No history yet" />
        </div>
      </div>
    </div>
  );
}
