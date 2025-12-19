import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { Construction } from 'lucide-react';

export default function AdminAnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">Platform performance and claim statistics.</p>
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="h-5 w-5 text-yellow-500" />
            Under Construction
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Advanced analytics and reporting dashboards will be available in the next release.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
