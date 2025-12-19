import { Link } from '@/i18n/routing';
import { db } from '@interdomestik/database/db';
import { claims, user } from '@interdomestik/database/schema';
import { Badge } from '@interdomestik/ui/components/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui/components/table';
import { format } from 'date-fns';
import { desc, eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';

async function getClaims() {
  return await db
    .select({
      id: claims.id,
      title: claims.title,
      status: claims.status,
      category: claims.category,
      createdAt: claims.createdAt,
      amount: claims.claimAmount,
      currency: claims.currency,
      user: {
        name: user.name,
        email: user.email,
        image: user.image,
      },
    })
    .from(claims)
    .leftJoin(user, eq(claims.userId, user.id))
    .orderBy(desc(claims.createdAt));
}

export default async function AdminClaimsPage() {
  const t = await getTranslations('agent.table');
  const tStatus = await getTranslations('claims.status');
  const claimList = await getClaims();

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'submitted':
        return 'bg-blue-100 text-blue-800 hover:bg-blue-200';
      case 'resolved':
        return 'bg-green-100 text-green-800 hover:bg-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 hover:bg-red-200';
      case 'draft':
        return 'bg-gray-100 text-gray-800 hover:bg-gray-200';
      default:
        return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200';
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Claims Management</h1>
        <p className="text-muted-foreground">View and manage all user claims.</p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('claimant')}</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>{t('status')}</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>{t('date')}</TableHead>
              <TableHead className="text-right">{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {claimList.map(claim => (
              <TableRow key={claim.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{claim.user?.name || 'Unknown'}</span>
                    <span className="text-xs text-muted-foreground">{claim.user?.email}</span>
                  </div>
                </TableCell>
                <TableCell className="font-medium">
                  {claim.title}
                  <div className="text-xs text-muted-foreground capitalize">{claim.category}</div>
                </TableCell>
                <TableCell>
                  <Badge className={getStatusColor(claim.status)} variant="secondary">
                    {tStatus(claim.status as 'draft' | 'submitted' | 'resolved')}
                  </Badge>
                </TableCell>
                <TableCell>
                  {claim.amount ? `${parseFloat(claim.amount).toFixed(2)} ${claim.currency}` : '-'}
                </TableCell>
                <TableCell>
                  {claim.createdAt ? format(new Date(claim.createdAt), 'dd MMM yyyy') : '-'}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/admin/claims/${claim.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    View Details
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {claimList.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No claims found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
