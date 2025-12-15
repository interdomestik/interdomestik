import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { ClaimsFilters } from '@/components/dashboard/claims/claims-filters';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import { claims } from '@interdomestik/database/schema';
import {
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { FileText, Plus } from 'lucide-react';
import { headers } from 'next/headers';

export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return null;
  }

  const params = await searchParams;
  const statusFilter = params.status;
  const searchQuery = params.search;

  // Build where conditions
  const conditions = [eq(claims.userId, session.user.id)];

  // Validate status filter against schema enum
  const validStatuses = [
    'draft',
    'submitted',
    'verification',
    'evaluation',
    'negotiation',
    'court',
    'resolved',
    'rejected',
  ];

  if (statusFilter && validStatuses.includes(statusFilter)) {
    conditions.push(
      eq(
        claims.status,
        statusFilter as
          | 'draft'
          | 'submitted'
          | 'verification'
          | 'evaluation'
          | 'negotiation'
          | 'court'
          | 'resolved'
          | 'rejected'
      )
    );
  }

  if (searchQuery) {
    conditions.push(
      or(ilike(claims.title, `%${searchQuery}%`), ilike(claims.companyName, `%${searchQuery}%`))!
    );
  }

  const myClaims = await db
    .select()
    .from(claims)
    .where(and(...conditions))
    .orderBy(desc(claims.createdAt));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">My Claims</h2>
          <p className="text-muted-foreground mt-1">
            Manage your consumer complaints and track their status.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/claims/new">
            <Plus className="mr-2 h-4 w-4" />
            New Claim
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <ClaimsFilters />

      {/* Claims Table */}
      {myClaims.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-6 mb-4">
              <FileText className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No claims found</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
              {searchQuery || statusFilter
                ? 'Try adjusting your filters or search query.'
                : "You haven't filed any claims yet. Start by creating your first claim."}
            </p>
            {!searchQuery && !statusFilter && (
              <Button asChild>
                <Link href="/dashboard/claims/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Claim
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead className="text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {myClaims.map(claim => (
                <TableRow key={claim.id} className="hover:bg-muted/50 cursor-pointer">
                  <TableCell className="font-medium">
                    <Link
                      href={`/dashboard/claims/${claim.id}`}
                      className="hover:underline underline-offset-4"
                    >
                      {claim.title}
                    </Link>
                  </TableCell>
                  <TableCell>{claim.companyName}</TableCell>
                  <TableCell className="capitalize text-sm text-muted-foreground">
                    {claim.category}
                  </TableCell>
                  <TableCell>
                    <ClaimStatusBadge status={claim.status} />
                  </TableCell>
                  <TableCell>
                    {claim.claimAmount ? (
                      <span className="font-medium">
                        €{parseFloat(claim.claimAmount).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm" suppressHydrationWarning>
                    {claim.createdAt ? new Date(claim.createdAt).toLocaleDateString() : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Results count */}
      {myClaims.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Showing {myClaims.length} {myClaims.length === 1 ? 'claim' : 'claims'}
        </p>
      )}
    </div>
  );
}
