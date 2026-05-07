import { Button } from '@interdomestik/ui';
import { ShieldAlert } from 'lucide-react';

import { Link } from '@/i18n/routing';

import type { DashboardTranslator } from './types';

export function AccountErrorState({ tLanding }: Readonly<{ tLanding: DashboardTranslator }>) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
      <div className="p-4 rounded-full bg-red-100 text-red-600">
        <ShieldAlert className="w-12 h-12" />
      </div>
      <h2 className="text-2xl font-bold">{tLanding('account_error_title')}</h2>
      <p className="text-muted-foreground">{tLanding('account_error_body')}</p>
      <Button asChild variant="outline" className="rounded-xl">
        <Link href="/member/help">{tLanding('account_error_cta')}</Link>
      </Button>
    </div>
  );
}
