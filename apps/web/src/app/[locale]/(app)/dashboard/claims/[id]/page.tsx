import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import { claims } from '@interdomestik/database/schema';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui';
import { eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/claims">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h2 className="text-3xl font-bold tracking-tight">Claim Details</h2>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{claim.title}</CardTitle>
            <CardDescription>Claim ID: {claim.id}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="font-semibold">Status:</span>
              <Badge
                className="ml-2 capitalize"
                variant={claim.status === 'resolved' ? 'default' : 'secondary'}
              >
                {claim.status}
              </Badge>
            </div>
            <div>
              <span className="font-semibold">Company:</span> {claim.companyName}
            </div>
            <div>
              <span className="font-semibold">Amount:</span>{' '}
              {claim.claimAmount ? `${claim.claimAmount} ${claim.currency}` : 'N/A'}
            </div>
            <div>
              <span className="font-semibold">Category:</span>{' '}
              <span className="capitalize">{claim.category}</span>
            </div>
            <div suppressHydrationWarning>
              <span className="font-semibold">Submitted:</span>{' '}
              {claim.createdAt?.toLocaleDateString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {claim.description || 'No description provided.'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
