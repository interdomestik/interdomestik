'use client';

import { usePathname, useRouter } from '@/i18n/routing';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui/components/select';
import { useSearchParams } from 'next/navigation';

export type AdminTenantOption = {
  id: string;
  name: string;
  countryCode: string;
};

export function AdminTenantSelector({
  tenants,
  defaultTenantId,
}: {
  tenants: AdminTenantOption[];
  defaultTenantId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (tenants.length === 0) return null;

  const selectedTenantId = searchParams.get('tenantId') ?? defaultTenantId ?? undefined;

  const handleTenantChange = (tenantId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tenantId', tenantId);

    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <Select value={selectedTenantId ?? ''} onValueChange={handleTenantChange}>
      <SelectTrigger className="h-9 w-[220px]">
        <SelectValue placeholder="Tenant" />
      </SelectTrigger>
      <SelectContent>
        {tenants.map(t => (
          <SelectItem key={t.id} value={t.id}>
            {t.name} ({t.countryCode.toUpperCase()})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
