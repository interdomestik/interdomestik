import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import {
  Badge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

export default async function AdminClaimsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Basic role check (improve later with real RBAC or middleware)
  if (!session || session.user.role !== 'admin') {
    return notFound();
  }

  // Fetch ALL claims
  const allClaims = await db.query.claims.findMany({
    orderBy: (claims, { desc }) => [desc(claims.createdAt)],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Claims Management</h2>
          <p className="text-muted-foreground">Review and manage all submitted consumer claims.</p>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableCaption>A list of all claims.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allClaims.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No claims found.
                </TableCell>
              </TableRow>
            ) : (
              allClaims.map(claim => (
                <TableRow key={claim.id}>
                  <TableCell className="font-mono text-xs">{claim.id}</TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/claims/${claim.id}`}
                      className="hover:underline underline-offset-4"
                    >
                      {claim.title}
                    </Link>
                  </TableCell>
                  <TableCell>{claim.companyName}</TableCell>
                  <TableCell className="capitalize">{claim.category}</TableCell>
                  <TableCell>
                    <Badge
                      variant={claim.status === 'resolved' ? 'default' : 'secondary'}
                      className="capitalize"
                    >
                      {claim.status}
                    </Badge>
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
