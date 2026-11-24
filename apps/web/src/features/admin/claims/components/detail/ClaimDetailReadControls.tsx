import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui/components/button';
import { Input } from '@interdomestik/ui/components/input';
import { STAFF_SEARCH_MAX_LENGTH } from '@interdomestik/domain-users/admin/search-assignable-staff';
import { getTranslations } from 'next-intl/server';
import type { OpsClaimDetailSearch } from '../../server/getOpsClaimDetail';

type PageProps = {
  claimId: string;
  search: OpsClaimDetailSearch;
  nextCursor: string | null;
};

export async function ClaimDetailPageLinks({
  claimId,
  search,
  nextCursor,
  cursorKey,
}: PageProps & { cursorKey: 'staffAfter' | 'documentsAfter' }) {
  if (!search[cursorKey] && !nextCursor) return null;
  const [t, claims] = await Promise.all([
    getTranslations('common'),
    getTranslations('admin.claims_page'),
  ]);
  const pathname = `/admin/claims/${encodeURIComponent(claimId)}`;
  const href = (cursor?: string) => ({ pathname, query: { ...search, [cursorKey]: cursor } });
  return (
    <nav
      aria-label={claims(cursorKey === 'staffAfter' ? 'assignment.label' : 'evidence.title')}
      className="flex flex-wrap gap-2"
    >
      {search[cursorKey] && (
        <Button asChild variant="outline" size="sm">
          <Link href={href()} prefetch={false}>
            {claims('first_page')}
          </Link>
        </Button>
      )}
      {nextCursor && (
        <Button asChild variant="outline" size="sm">
          <Link href={href(nextCursor)} prefetch={false}>
            {t('next')}
          </Link>
        </Button>
      )}
    </nav>
  );
}

export async function ClaimStaffSearch({ claimId, search, nextCursor }: PageProps) {
  const [t, assignment] = await Promise.all([
    getTranslations('common'),
    getTranslations('admin.claims_page.assignment'),
  ]);
  return (
    <div className="space-y-2">
      <form method="get" className="flex flex-wrap items-end gap-2">
        {search.documentsAfter && (
          <input type="hidden" name="documentsAfter" value={search.documentsAfter} />
        )}
        <label className="grid min-w-0 flex-1 gap-1 text-sm">
          {assignment('search_staff')}
          <Input
            type="search"
            name="staffSearch"
            defaultValue={search.staffSearch}
            maxLength={STAFF_SEARCH_MAX_LENGTH}
          />
        </label>
        <Button type="submit" variant="outline">
          {t('search')}
        </Button>
      </form>
      <ClaimDetailPageLinks
        claimId={claimId}
        search={search}
        nextCursor={nextCursor}
        cursorKey="staffAfter"
      />
    </div>
  );
}
