import { TriagePanel } from '@/components/agent/triage-panel';
import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { DocumentList } from '@/components/documents/document-list';
import { MessagingPanel } from '@/components/messaging/messaging-panel';
import { auth } from '@/lib/auth';
import { claimDocuments, claims, db, user } from '@interdomestik/database';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AgentClaimDetailPage({ params }: Props) {
  const { id } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) return notFound();

  const [claim] = await db
    .select({
      id: claims.id,
      title: claims.title,
      description: claims.description,
      status: claims.status,
      category: claims.category,
      amount: claims.claimAmount,
      currency: claims.currency,
      company: claims.companyName,
      createdAt: claims.createdAt,
      // User Info
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
    })
    .from(claims)
    .leftJoin(user, eq(claims.userId, user.id))
    .where(eq(claims.id, id));

  if (!claim) notFound();

  // Fetch documents
  const documents = await db.select().from(claimDocuments).where(eq(claimDocuments.claimId, id));

  const t = await getTranslations('agent.details');
  const tClaims = await getTranslations('claims');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Claimant Info */}
          <Card>
            <CardHeader>
              <CardTitle>{t('claimantInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-sm text-muted-foreground">{t('name')}</div>
                <div className="font-medium">{claim.userName || 'Unknown'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">{t('email')}</div>
                <div className="font-medium">{claim.userEmail || 'No email'}</div>
              </div>
            </CardContent>
          </Card>

          {/* Claim Details */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t('title')}</CardTitle>
                <ClaimStatusBadge status={claim.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground">{t('title_label')}</div>
                <div className="text-lg font-medium">{claim.title}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">{t('description')}</div>
                <div className="whitespace-pre-wrap">{claim.description || '-'}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">{t('category_label')}</div>
                  <Badge variant="outline" className="capitalize">
                    {tClaims(`category.${claim.category}`)}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">{t('status_label')}</div>
                  <div className="capitalize">{tClaims(`status.${claim.status}`)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">{t('amount')}</div>
                  <div className="text-lg font-bold">
                    {claim.amount ? `${claim.amount} ${claim.currency || 'EUR'}` : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">{t('company')}</div>
                  <div>{claim.company}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Evidence - Now with View/Download buttons */}
          <Card>
            <CardHeader>
              <CardTitle>{t('evidence')}</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentList
                documents={documents.map(doc => ({
                  id: doc.id,
                  name: doc.name,
                  fileSize: doc.fileSize,
                  fileType: doc.fileType,
                }))}
              />
            </CardContent>
          </Card>

          {/* Messaging Panel for agents (with internal notes) */}
          <MessagingPanel claimId={claim.id} currentUserId={session.user.id} isAgent={true} />
        </div>

        <div className="space-y-6">
          <TriagePanel claimId={claim.id} currentStatus={claim.status || 'draft'} />

          <Card>
            <CardHeader>
              <CardTitle>{t('notes')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{t('notesPlaceholder')}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
