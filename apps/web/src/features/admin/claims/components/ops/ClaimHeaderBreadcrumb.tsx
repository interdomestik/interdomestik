import { Link } from '@/i18n/routing';
import { ChevronRight, Copy, Link as LinkIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { ClaimOpsDetail } from '../../types';
import { copyText } from './clipboard';

// 44px copy targets on phones; the compact 24px icon buttons return from `sm` up.
const COPY_TARGET = 'inline-flex size-11 items-center justify-center sm:inline-block sm:size-auto';

interface ClaimHeaderBreadcrumbProps {
  claim: ClaimOpsDetail;
  backHref: string;
  memberProfileHref: string;
  activeLocale: string;
}

export function ClaimHeaderBreadcrumb({
  claim,
  backHref,
  memberProfileHref,
  activeLocale,
}: Readonly<ClaimHeaderBreadcrumbProps>) {
  const tLifecycle = useTranslations('admin.claims_page.lifecycle_tabs');
  const tPage = useTranslations('admin.claims_page');
  const tHeader = useTranslations('admin.claims_page.header');
  const claimResolverHref = claim.claimNumber
    ? `/admin/claims/number/${claim.claimNumber}`
    : `/admin/claims/${claim.id}`;
  const memberResolverHref = claim.memberNumber
    ? `/admin/members/number/${claim.memberNumber}`
    : memberProfileHref;

  const copyToClipboard = async (text: string, label: string) => {
    const copied = await copyText(text);

    if (!copied) {
      toast.error(tHeader('copy_failed'));
      return;
    }

    toast.success(tHeader('copy_success', { label }));
  };

  const domain = typeof window !== 'undefined' ? window.location.origin : '';
  const canonicalUrl = `${domain}/${activeLocale}/admin/claims/${claim.id}`;
  const resolverUrl = claim.claimNumber
    ? `${domain}/${activeLocale}/admin/claims/number/${claim.claimNumber}`
    : canonicalUrl;

  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-sm" aria-label={tHeader('breadcrumb')}>
      <Link
        href={backHref}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        {tPage('title')}
      </Link>

      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />

      <Link
        href={`/admin/claims?lifecycle=${claim.lifecycleStage}`}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        {tLifecycle(claim.lifecycleStage)}
      </Link>

      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />

      <div className="flex items-center gap-1 group/claim">
        <Link
          href={claimResolverHref}
          className="font-mono font-medium text-foreground bg-slate-100 px-1.5 py-0.5 rounded text-xs border border-slate-200 hover:bg-slate-200 transition-colors"
          title={tHeader('claim_number_link')}
        >
          {claim.claimNumber ?? claim.code}
        </Link>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => copyToClipboard(resolverUrl, tHeader('claim_number_link'))}
            className={`${COPY_TARGET} p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600`}
            title={tHeader('copy_traceable_link')}
            aria-label={tHeader('copy_traceable_link')}
          >
            <LinkIcon className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => copyToClipboard(canonicalUrl, tHeader('canonical_url'))}
            className={`${COPY_TARGET} p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600`}
            title={tHeader('copy_canonical_link')}
            aria-label={tHeader('copy_canonical_link')}
          >
            <Copy className="w-3 h-3" />
          </button>
        </div>
      </div>

      {claim.memberNumber && (
        <div className="flex items-center gap-1 group/member ml-2 border-l pl-2 border-slate-200">
          <Link
            href={memberResolverHref}
            className="font-mono font-medium text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded text-xs border border-amber-200"
            title={tPage('member_number')}
          >
            {claim.memberNumber}
          </Link>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => copyToClipboard(claim.memberNumber!, tHeader('member_number'))}
              className={`${COPY_TARGET} p-1 hover:bg-amber-100 rounded text-amber-600/70 hover:text-amber-700`}
              title={tPage('copy_member_number')}
              aria-label={tPage('copy_member_number')}
            >
              <Copy className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() =>
                copyToClipboard(
                  `${domain}/${activeLocale}/admin/members/number/${claim.memberNumber}`,
                  tHeader('member_link')
                )
              }
              className={`${COPY_TARGET} p-1 hover:bg-amber-100 rounded text-amber-600/70 hover:text-amber-700`}
              title={tPage('copy_member_link')}
              aria-label={tPage('copy_member_link')}
            >
              <LinkIcon className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
