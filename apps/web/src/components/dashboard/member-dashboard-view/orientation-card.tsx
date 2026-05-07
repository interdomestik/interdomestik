import { Button } from '@interdomestik/ui';

import { Link } from '@/i18n/routing';

import type { DashboardTranslator } from './types';

export function OrientationCard({
  orientationHref,
  tLanding,
}: Readonly<{
  orientationHref: string;
  tLanding: DashboardTranslator;
}>) {
  return (
    <section data-testid="member-orientation-card" className="rounded-2xl border p-5 space-y-4">
      <h2 className="text-lg font-semibold">{tLanding('orientation_title')}</h2>
      <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
        <li>{tLanding('orientation_point_one')}</li>
        <li>{tLanding('orientation_point_two')}</li>
      </ul>
      <Button asChild variant="outline" className="rounded-xl">
        <Link href={orientationHref}>{tLanding('orientation_cta')}</Link>
      </Button>
    </section>
  );
}
