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
  queryString?: string;
}

export async function RecentActivityCard({ claims, queryString }: RecentActivityCardProps) {
  const tAdmin = await getTranslations('admin.dashboard');
  const tClaims = await getTranslations('claims.status');

  const withAdminContext = (href: string) => {
    if (!queryString) return href;

    const [path, destinationQuery] = href.split('?');
    const merged = new URLSearchParams(queryString);
    if (destinationQuery) {
      const destinationParams = new URLSearchParams(destinationQuery);
      const destinationKeys = new Set(Array.from(destinationParams.keys()));
      for (const key of destinationKeys) {
        merged.delete(key);
        for (const value of destinationParams.getAll(key)) {
          merged.append(key, value);
        }
      }
    }

    const next = merged.toString();
    return next ? `${path}?${next}` : path;
  };

  return (
    <Card className="col-span-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle as="h2">{tAdmin('recent_activity')}</CardTitle>
          <CardDescription>
            {claims.length === 0 ? tAdmin('no_recent_activity') : ''}
          </CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href={withAdminContext('/admin/claims')}>{tAdmin('view_all')}</Link>
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
                  <Link href={withAdminContext(`/admin/claims/${claim.id}`)}>
                    <FileText className="h-4 w-4" />
                    <span className="sr-only">{tAdmin('view_details')}</span>
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
