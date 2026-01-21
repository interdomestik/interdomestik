'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export type TenantOption = {
  id: string;
  name: string;
  countryCode: string;
};

export function TenantSelector({
  tenants,
  title = 'Select your country',
}: {
  readonly tenants: TenantOption[];
  readonly title?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (tenants.length === 0) return null;

  // Extract the path without locale prefix (e.g., /login from /sq/login)
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/login';
  const locale = (/^\/([a-z]{2})(?=\/|$)/i.exec(pathname)?.[1] ?? 'en').toLowerCase();

  return (
    <Card
      data-testid="tenant-chooser"
      className="w-full max-w-md border-none shadow-xl ring-1 ring-white/10 bg-white/5 backdrop-blur-lg"
    >
      <CardHeader className="text-center space-y-1">
        <CardTitle data-testid="tenant-chooser-title" className="text-lg font-semibold">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {tenants.map(tenant => {
          const params = new URLSearchParams(searchParams);
          params.set('tenantId', tenant.id);
          // Keep current locale; locale is language-only and must never imply tenant.
          const href = `/${locale}${pathWithoutLocale}?${params.toString()}`;
          return (
            <Button
              key={tenant.id}
              asChild
              variant="outline"
              className="w-full justify-between"
              data-testid={`tenant-option-${tenant.id}`}
            >
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
