import { TriagePanel } from '@/components/agent/triage-panel';
import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { claims, db, user } from '@interdomestik/database';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AgentClaimDetailPage({ params }: Props) {
  const { id } = await params;

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

  // Fetch documents (Disabled for MVP until schema sync is stable)
  // const documents = await db
  //   .select()
  //   .from(claimDocuments)
  //   .where(eq(claimDocuments.claimId, id));
  const documents: any[] = [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Claim Details</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Claimant Info */}
          <Card>
            <CardHeader>
              <CardTitle>Claimant Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-sm text-muted-foreground">Name</div>
                <div className="font-medium">{claim.userName || 'Unknown'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Email</div>
                <div className="font-medium">{claim.userEmail || 'No email'}</div>
              </div>
            </CardContent>
          </Card>

          {/* Claim Details */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Claim Details</CardTitle>
                <ClaimStatusBadge status={claim.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground">Title</div>
                <div className="text-lg font-medium">{claim.title}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Description</div>
                <div className="whitespace-pre-wrap">{claim.description || '-'}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Category</div>
                  <Badge variant="outline" className="capitalize">
                    {claim.category}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <div className="capitalize">{claim.status}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Amount</div>
                  <div className="text-lg font-bold">
                    {claim.amount ? `${claim.amount} ${claim.currency || 'EUR'}` : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Subject / Company</div>
                  <div>{claim.company}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Evidence */}
          <Card>
            <CardHeader>
              <CardTitle>Evidence Files</CardTitle>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents uploaded.</p>
              ) : (
                <ul className="list-disc space-y-2 pl-4">
                  {documents.map(doc => (
                    <li key={doc.id} className="text-sm">
                      <span className="font-medium">{doc.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({(doc.fileSize / 1024).toFixed(1)} KB)
                      </span>
                      {/* View/Download link logic requires signing URLs - skipping for MVP list */}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <TriagePanel claimId={claim.id} currentStatus={claim.status || 'draft'} />

          <Card>
            <CardHeader>
              <CardTitle>Internal Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Private agent notes feature coming soon.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
