import { Link } from '@/i18n/routing';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { ArrowRight } from 'lucide-react';

interface MemberCtaHandoffPageProps {
  title: string;
  description: string;
  boundary: string;
  primaryLabel: string;
  primaryHref: '/member/claims/new' | '/member/diaspora' | '/member/membership';
  secondaryLabel: string;
  testId:
    | 'report-page-ready'
    | 'green-card-page-ready'
    | 'benefits-page-ready'
    | 'incident-guide-page-ready';
  nextStepsLabel: string;
}

export function MemberCtaHandoffPage({
  title,
  description,
  boundary,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  testId,
  nextStepsLabel,
}: Readonly<MemberCtaHandoffPageProps>) {
  return (
    <div className="container max-w-4xl space-y-6 py-8" data-testid={testId}>
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="max-w-2xl text-muted-foreground">{description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{nextStepsLabel}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{boundary}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href={primaryHref}>
                {primaryLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/member/help">{secondaryLabel}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
