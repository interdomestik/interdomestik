'use client';

import { Link } from '@/i18n/routing';
import { Badge, Button } from '@interdomestik/ui';
import { format } from 'date-fns';
import { ChevronLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ClaimDetailHeaderProps {
  readonly claim: {
    id: string;
    title: string | null;
    category?: string | null;
    createdAt?: string | Date | null;
  };
  readonly backHref?: string;
}

export function ClaimDetailHeader({ claim, backHref = '/member/claims' }: ClaimDetailHeaderProps) {
  const tCategory = useTranslations('claims.category');
  const tCommon = useTranslations('common');

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2 mb-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 h-8 px-2 text-muted-foreground"
          >
            <Link href={backHref}>
              <ChevronLeft className="mr-1 h-4 w-4" /> {tCommon('back')}
            </Link>
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight">{claim.title}</h1>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            {tCategory(claim.category || 'other')}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {format(new Date(claim.createdAt!), 'PPP p')} • ID: {claim.id}
        </p>
      </div>
    </div>
  );
}
