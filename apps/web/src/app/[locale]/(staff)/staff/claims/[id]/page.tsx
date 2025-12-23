import { ClaimDetailHeader } from '@/components/agent/claim-detail-header';
import { ClaimDocumentsPane } from '@/components/agent/claim-documents-pane';
import { ClaimInfoPane } from '@/components/agent/claim-info-pane';
import { MessagingPanel } from '@/components/messaging/messaging-panel';
import { auth } from '@/lib/auth';
import { claimDocuments, claims, db, eq } from '@interdomestik/database';
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

  if (!session || session.user.role !== 'staff') {
    return notFound();
  }

  const claim = await db.query.claims.findFirst({
    where: eq(claims.id, id),
    with: {
      user: true,
    },
  });

  if (!claim) return notFound();

  const documents = await db
    .select({
      id: claimDocuments.id,
      name: claimDocuments.name,
      fileSize: claimDocuments.fileSize,
      fileType: claimDocuments.fileType,
      createdAt: claimDocuments.createdAt,
    })
    .from(claimDocuments)
    .where(eq(claimDocuments.claimId, id));

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
                <MessagingPanel claimId={id} currentUserId={session.user.id} isAgent />
              </TabsContent>

              <TabsContent value="documents">
                <ClaimDocumentsPane documents={documents.map(d => ({ ...d, fileName: d.name }))} />
              </TabsContent>

              <TabsContent value="triage">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('details.notes')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {t('details.notesPlaceholder')}
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <div className="lg:col-span-4 space-y-6">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <ClaimInfoPane claim={claim as any} />
        </div>
      </div>
    </div>
  );
}
