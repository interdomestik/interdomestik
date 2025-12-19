import type { getRecentClaims } from '@/actions/admin-dashboard';
import { Link } from '@/i18n/routing';
import { Badge } from '@interdomestik/ui/components/badge';
import { Button } from '@interdomestik/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui/components/card';
import { FileText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

type ClaimWithUser = Awaited<ReturnType<typeof getRecentClaims>>[number];

interface RecentActivityCardProps {
  claims: ClaimWithUser[];
}

export async function RecentActivityCard({ claims }: RecentActivityCardProps) {
  const tAdmin = await getTranslations('admin.dashboard');
  const tClaims = await getTranslations('claims.status');

  return (
    <Card className="col-span-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{tAdmin('recent_activity')}</CardTitle>
          <CardDescription>
            {claims.length === 0 ? tAdmin('no_recent_activity') : ''}
          </CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/claims">{tAdmin('view_all')}</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {claims.map(claim => (
            <div
              key={claim.id}
              className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none">{claim.title}</p>
                <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                  {claim.user?.name || 'Unknown'} • {claim.companyName}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={claim.status === 'resolved' ? 'default' : 'secondary'}>
                  {tClaims(claim.status || 'draft')}
                </Badge>
                <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                  <Link href={`/admin/claims/${claim.id}`}>
                    <FileText className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
