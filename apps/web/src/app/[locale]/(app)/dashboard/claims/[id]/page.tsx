import { ClaimDraftActions } from '@/components/claims/claim-draft-actions';
import { ClaimTimeline } from '@/components/dashboard/claims/claim-timeline';
import { DocumentList } from '@/components/documents/document-list';
import { MessagingPanel } from '@/components/messaging/messaging-panel';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { claimDocuments, claims, db, eq } from '@interdomestik/database';
import { Badge } from '@interdomestik/ui/components/badge';
import { Button } from '@interdomestik/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { ArrowLeft, Download } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{
    locale: string;
    id: string;
  }>;
}

export default async function ClaimDetailsPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) return notFound();

  const [claim] = await db.select().from(claims).where(eq(claims.id, id)).limit(1);

  const documents = await db
    .select({
      id: claimDocuments.id,
      name: claimDocuments.name,
      fileSize: claimDocuments.fileSize,
      fileType: claimDocuments.fileType,
    })
    .from(claimDocuments)
    .where(eq(claimDocuments.claimId, id));

  if (!claim) return notFound();

  // Security check: simple ownership or admin
  if (claim.userId !== session.user.id && session.user.role !== 'admin') {
    return notFound();
  }

  const tClaims = await getTranslations('claims');

  return (
    <div className="flex flex-col h-full space-y-8 p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link
            href="/dashboard/claims"
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
              />
            </CardContent>
          </Card>

          {/* Messaging Panel for mobile (in sidebar) */}
          <div className="lg:hidden">
            <MessagingPanel claimId={claim.id} currentUserId={session.user.id} isAgent={false} />
          </div>

          {/* Admin Debug Tools (Client-side would be better but this is handy for MVP) */}
          {session.user.role === 'admin' && (
            <Card className="border-dashed border-yellow-500/50 bg-yellow-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-yellow-600">Admin Actions</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Manual status overrides would go here.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
