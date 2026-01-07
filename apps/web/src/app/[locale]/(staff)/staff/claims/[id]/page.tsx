import { ClaimDetailHeader } from '@/components/agent/claim-detail-header';
import { ClaimDocumentsPane } from '@/components/agent/claim-documents-pane';
import { ClaimInfoPane } from '@/components/agent/claim-info-pane';
import { ClaimMessenger } from '@/components/shared/claim-messenger';
import { ClaimActionPanel } from '@/components/staff/claim-action-panel';
import { ClaimTriageNotes } from '@/components/staff/claim-triage-notes';
import { auth } from '@/lib/auth';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@interdomestik/ui';
import { FileText, MessageSquare, ShieldAlert } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { getStaffClaimDetailsCore } from './_core';

interface PageProps {
  params: Promise<{
    locale: string;
    id: string;
  }>;
}

export default async function StaffClaimDetailsPage({ params }: PageProps) {
  const { id, locale } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.role !== 'staff') {
    return notFound();
  }

  const result = await getStaffClaimDetailsCore({ claimId: id });
  if (result.kind !== 'ok') return notFound();

  const { claim, documents, stageHistory } = result;

  const t = await getTranslations('agent-claims.claims');

  return (
    <div className="flex flex-col gap-6 animate-fade-in p-4 md:p-8 max-w-7xl mx-auto">
      <ClaimDetailHeader claim={claim} backHref="/staff/claims" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <Tabs defaultValue="messages" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1">
              <TabsTrigger value="messages" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                {t('details.messages')}
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-2">
                <FileText className="h-4 w-4" />
                {t('details.documents')}
              </TabsTrigger>
              <TabsTrigger value="triage" className="gap-2">
                <ShieldAlert className="h-4 w-4" />
                {t('details.notes')}
              </TabsTrigger>
            </TabsList>

            <div className="mt-4">
              <TabsContent value="messages">
                <ClaimMessenger claimId={id} currentUserId={session.user.id} userRole="staff" />
              </TabsContent>

              <TabsContent value="documents">
                <ClaimDocumentsPane documents={documents} />
              </TabsContent>

              <TabsContent value="triage">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('details.notes')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      <ClaimTriageNotes
                        claimId={claim.id}
                        currentStatus={claim.status || 'draft'}
                      />

                      <div className="space-y-3">
                        <h4 className="text-sm font-medium">History</h4>

                        {stageHistory.length === 0 ? (
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {t('details.notesPlaceholder')}
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {stageHistory.map(entry => (
                              <div
                                key={entry.id}
                                className="rounded-lg border bg-muted/20 p-3 space-y-2"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-sm">
                                    <span className="font-medium">{entry.toStatus}</span>
                                    {entry.fromStatus && entry.fromStatus !== entry.toStatus ? (
                                      <span className="text-muted-foreground">
                                        {' '}
                                        (from {entry.fromStatus})
                                      </span>
                                    ) : null}
                                  </div>

                                  <div className="text-xs text-muted-foreground">
                                    {entry.createdAt
                                      ? new Intl.DateTimeFormat(undefined, {
                                          year: 'numeric',
                                          month: 'short',
                                          day: '2-digit',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        }).format(entry.createdAt)
                                      : null}
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span>{entry.isPublic ? 'Public' : 'Internal'}</span>
                                  {entry.changedByName || entry.changedByEmail ? (
                                    <span>• {entry.changedByName || entry.changedByEmail}</span>
                                  ) : null}
                                </div>

                                {entry.note ? (
                                  <p className="text-sm whitespace-pre-wrap">{entry.note}</p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <ClaimActionPanel
            claimId={claim.id}
            currentStatus={claim.status || 'draft'}
            staffId={session.user.id}
            assigneeId={claim.staffId || null}
          />
          <ClaimInfoPane claim={claim} />
        </div>
      </div>
    </div>
  );
}
