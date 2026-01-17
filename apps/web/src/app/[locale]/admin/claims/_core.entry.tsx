// @deprecated v2.0.2-admin-claims-ops — Use AdminClaimsV2Page from features/admin/claims instead
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminClaimsFilters } from '@/components/admin/claims/claims-filters';
import { ClaimsList } from '@/components/admin/claims/claims-list';
import { auth } from '@/lib/auth';
import { getClaimsListV2 } from '@/server/domains/claims';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';

export default async function AdminClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const tAdmin = await getTranslations('admin.claims_page');
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const params = await searchParams;
  const page = Number(params?.page || 1);
  const statusParam = params?.status as string | undefined;
  const normalizedStatus = statusParam === 'all' ? undefined : statusParam;
  const statusFilter =
    normalizedStatus && ['active', 'draft', 'closed'].includes(normalizedStatus)
      ? (normalizedStatus as any)
      : undefined;
  const statuses =
    normalizedStatus && !statusFilter ? (normalizedStatus.split(',') as any[]) : undefined;
  const assignmentParam = params?.assigned as string | undefined;
  const search = params?.search as string | undefined;

  let claimsData;
  try {
    claimsData = await getClaimsListV2(session, {
      page,
      statusFilter,
      statuses,
      assignment: assignmentParam as any,
      search,
    });
  } catch (err: any) {
    const name = err?.name;
    const msg = err?.message;
    const code = err?.code;

    // Widen checks to catch any flavor of unauthorized
    if (
      name === 'UnauthorizedError' ||
      name === 'AccessDeniedError' ||
      msg === 'Unauthorized' ||
      code === 'UNAUTHORIZED' ||
      code === 'FORBIDDEN'
    ) {
      const { notFound } = await import('next/navigation');
      notFound();
    }
    throw err;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <AdminPageHeader title={tAdmin('title')} subtitle={tAdmin('description')} />

      <div className="space-y-6">
        <AdminClaimsFilters />
        <ClaimsList data={claimsData} />
      </div>
    </div>
  );
}
export { generateMetadata, generateViewport } from '@/app/_segment-exports';
