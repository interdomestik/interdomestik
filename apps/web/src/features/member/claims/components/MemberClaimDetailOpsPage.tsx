'use client';

import {
  OpsActionBar,
  OpsDocumentsPanel,
  OpsStatusBadge,
  OpsTimeline,
  OPS_TEST_IDS,
} from '@/components/ops';
import { toOpsDocuments, toOpsStatus, toOpsTimelineEvents } from '@/components/ops/adapters/claims';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@interdomestik/ui';
import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ClaimTrackingDetailDto } from '@/features/claims/tracking/types';

interface MemberClaimDetailOpsPageProps {
  claim: ClaimTrackingDetailDto;
}

export function MemberClaimDetailOpsPage({ claim }: MemberClaimDetailOpsPageProps) {
  const t = useTranslations('claims');

  // Transform events and translate titles
  const opsEvents = toOpsTimelineEvents(claim.timeline).map(e => ({
    ...e,
    title: t(e.title), // Translate the labelKey
  }));

  const opsDocuments = toOpsDocuments(claim.documents);

  // Policy-driven actions (Skeleton)
  const actions = [
    {
      label: 'Upload Evidence',
      onClick: () => console.log('Upload'),
      variant: 'default' as const,
      disabled: false,
    },
    {
      label: 'Send Message',
      onClick: () => console.log('Message'),
      variant: 'outline' as const,
      disabled: false,
    },
  ];

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
        <OpsActionBar secondary={actions} />
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
              <Button size="sm" variant="outline" onClick={() => console.log('Upload clicked')}>
                <Upload className="w-4 h-4 mr-2" /> Upload
              </Button>
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
