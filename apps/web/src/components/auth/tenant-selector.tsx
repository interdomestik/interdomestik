'use client';

import { Link, usePathname } from '@/i18n/routing';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { useSearchParams } from 'next/navigation';

export type TenantOption = {
  id: string;
  name: string;
  countryCode: string;
};

export function TenantSelector({
  tenants,
  title = 'Select your country',
}: {
  tenants: TenantOption[];
  title?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (tenants.length === 0) return null;

  return (
    <Card className="w-full max-w-md border-none shadow-xl ring-1 ring-white/10 bg-white/5 backdrop-blur-lg">
      <CardHeader className="text-center space-y-1">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {tenants.map(tenant => {
          const params = new URLSearchParams(searchParams);
          params.set('tenantId', tenant.id);
          const href = `${pathname}?${params.toString()}`;
          return (
            <Button key={tenant.id} asChild variant="outline" className="w-full justify-between">
              <Link href={href}>
                <span>{tenant.name}</span>
                <span className="text-xs text-muted-foreground">
                  {tenant.countryCode.toUpperCase()}
                </span>
              </Link>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}
