import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { ClaimTimeline } from '@/components/dashboard/claims/claim-timeline';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import { claims } from '@interdomestik/database/schema';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui';
import { eq } from 'drizzle-orm';
import { ArrowLeft, Building2, Calendar, FileText, Tag, Wallet } from 'lucide-react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

export default async function ClaimDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) return notFound();

  const claim = await db.query.claims.findFirst({
    where: eq(claims.id, id),
  });

  if (!claim || claim.userId !== session.user.id) {
    return notFound();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/claims">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h2 className="text-3xl font-bold tracking-tight">{claim.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">Claim ID: {claim.id}</p>
        </div>
        <ClaimStatusBadge status={claim.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Claim Details Card */}
          <Card>
            <CardHeader>
              <CardTitle>Claim Information</CardTitle>
              <CardDescription>Details about your consumer protection claim</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    Company
                  </dt>
                  <dd className="text-sm font-semibold">{claim.companyName}</dd>
                </div>

                <div className="space-y-1">
                  <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Tag className="h-4 w-4" />
                    Category
                  </dt>
                  <dd className="text-sm font-semibold capitalize">{claim.category}</dd>
                </div>

                <div className="space-y-1">
                  <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Wallet className="h-4 w-4" />
                    Claim Amount
                  </dt>
                  <dd className="text-sm font-semibold">
                    {claim.claimAmount ? (
                      <span className="text-lg">€{parseFloat(claim.claimAmount).toFixed(2)}</span>
                    ) : (
                      <span className="text-muted-foreground">Not specified</span>
                    )}
                  </dd>
                </div>

                <div className="space-y-1">
                  <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Submitted
                  </dt>
                  <dd className="text-sm font-semibold" suppressHydrationWarning>
                    {claim.createdAt
                      ? new Date(claim.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      : 'N/A'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Description Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Description
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {claim.description || 'No description provided.'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Documents Card - Placeholder for future */}
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription>Evidence and supporting files</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="rounded-full bg-muted p-4 mb-3">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No documents uploaded yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Document upload feature coming soon
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Timeline */}
        <div className="lg:col-span-1">
          {claim.createdAt && <ClaimTimeline claimCreatedAt={new Date(claim.createdAt)} />}
        </div>
      </div>
    </div>
  );
}
