import { ClaimDraftActions } from '@/components/claims/claim-draft-actions';
import { ClaimTimeline } from '@/components/dashboard/claims/claim-timeline';
import { DocumentList } from '@/components/documents/document-list';
import { MessagingPanel } from '@/components/messaging/messaging-panel';
import { Link, redirect } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { claimDocuments, claimStageHistory, claims, db, eq } from '@interdomestik/database';
import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { and, desc } from 'drizzle-orm';
import { ArrowLeft, Download } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

function toClaimStatus(value: unknown): ClaimStatus {
  return CLAIM_STATUSES.includes(value as ClaimStatus) ? (value as ClaimStatus) : 'draft';
}

interface PageProps {
  params: Promise<{
    locale: string;
    id: string;
  }>;
}

export default async function ClaimDetailsPage({ params }: PageProps) {
  const { id, locale } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) return notFound();

  // Fetch claim with user info
  const claim = await db.query.claims.findFirst({
    where: eq(claims.id, id),
    with: {
      user: true,
    },
  });

  if (!claim) return notFound();

  const role = session.user.role;

  if (role !== 'user') {
    if (role === 'staff') {
      redirect({ href: `/staff/claims/${id}`, locale });
    } else if (role === 'admin') {
      redirect({ href: `/admin/claims/${id}`, locale });
    } else if (role === 'agent') {
      redirect({ href: '/agent', locale });
    }
    return notFound();
  }

  if (claim.userId !== session.user.id) {
    return notFound();
  }

  // Fetch documents
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

  const publicStageHistory = await db
    .select({
      toStatus: claimStageHistory.toStatus,
      createdAt: claimStageHistory.createdAt,
    })
    .from(claimStageHistory)
    .where(and(eq(claimStageHistory.claimId, id), eq(claimStageHistory.isPublic, true)))
    .orderBy(desc(claimStageHistory.createdAt));

  // --- MEMBER VIEW ---
  const tClaims = await getTranslations('claims');

  return (
    <div className="flex flex-col h-full space-y-8 p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link
            href="/member/claims"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center mb-2 transition-colors"
          >
            <ArrowLeft className="mr-1 h-3 w-3" /> Back to My Claims
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{claim.title}</h1>
            <Badge
              variant={(claim.status || 'draft') === 'draft' ? 'outline' : 'default'}
              className="uppercase text-xs"
            >
              {claim.status}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Case ID: <span className="font-mono text-foreground">{claim.id}</span> • Created{' '}
            {claim.createdAt?.toLocaleDateString() || 'N/A'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {claim.status === 'draft' && <ClaimDraftActions claimId={claim.id} />}
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content: Info & Evidence */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Case Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-medium text-sm text-muted-foreground mb-1">Description</h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {claim.description || 'No description provided.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground mb-1">
                    Company Involved
                  </h3>
                  <p className="font-medium">{claim.companyName || 'N/A'}</p>
                </div>
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground mb-1">Claim Amount</h3>
                  <p className="font-medium">
                    {claim.claimAmount ? `${claim.claimAmount} ${claim.currency}` : 'Not specified'}
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground mb-1">Category</h3>
                  <p className="capitalize">{claim.category?.replace('_', ' ') || 'General'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{tClaims('detail.evidence')}</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentList documents={documents} />
            </CardContent>
          </Card>

          {/* Messaging Panel for desktop (full width in main column) */}
          <div className="hidden lg:block">
            <MessagingPanel claimId={claim.id} currentUserId={session.user.id} isAgent={false} />
          </div>
        </div>

        {/* Sidebar: Timeline */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Case Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <ClaimTimeline
                status={claim.status || 'draft'}
                updatedAt={claim.updatedAt || new Date()}
                history={publicStageHistory.map(h => ({
                  toStatus: toClaimStatus(h.toStatus),
                  createdAt: h.createdAt,
                }))}
              />
            </CardContent>
          </Card>

          {/* Messaging Panel for mobile (in sidebar) */}
          <div className="lg:hidden">
            <MessagingPanel claimId={claim.id} currentUserId={session.user.id} isAgent={false} />
          </div>
        </div>
      </div>
    </div>
  );
}
