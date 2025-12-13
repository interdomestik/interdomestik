import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import { claims } from '@interdomestik/database/schema';
import {
  Button,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui';
import { eq } from 'drizzle-orm';
import { Plus } from 'lucide-react';
import { headers } from 'next/headers';

export default async function ClaimsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return null;
  }

  const myClaims = await db.select().from(claims).where(eq(claims.userId, session.user.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">My Claims</h2>
          <p className="text-muted-foreground">
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

      <div className="rounded-md border">
        <Table>
          <TableCaption>A list of your recent claims.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead className="text-right">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {myClaims.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No claims found.
                </TableCell>
              </TableRow>
            ) : (
              myClaims.map(claim => (
                <TableRow key={claim.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/dashboard/claims/${claim.id}`}
                      className="hover:underline underline-offset-4"
                    >
                      {claim.title}
                    </Link>
                  </TableCell>
                  <TableCell>{claim.companyName}</TableCell>
                  <TableCell className="capitalize">{claim.status}</TableCell>
                  <TableCell>
                    {claim.claimAmount ? `${claim.claimAmount} ${claim.currency}` : '-'}
                  </TableCell>
                  <TableCell className="text-right" suppressHydrationWarning>
                    {claim.createdAt ? new Date(claim.createdAt).toLocaleDateString() : '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
