import { AdminClaimDetailV2Page } from '@/features/admin/claims/components/AdminClaimDetailV2Page';
import { STAFF_SEARCH_MAX_LENGTH } from '@interdomestik/domain-users/admin/search-assignable-staff';
import { notFound } from 'next/navigation';
import { z } from 'zod';

// IDs are opaque text. Bound their size and reject blank values, controls and repeated params.
const cursor = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[^\s\p{Cc}]+$/u)
  .optional();
const searchSchema = z.object({
  documentsAfter: cursor,
  staffAfter: cursor,
  staffSearch: z
    .string()
    .max(STAFF_SEARCH_MAX_LENGTH)
    .regex(/^[^\p{Cc}]*$/u)
    .trim()
    .optional(),
});

export default async function AdminClaimDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id, locale }, query] = await Promise.all([params, searchParams]);
  const search = searchSchema.safeParse(query);
  if (!search.success) return notFound();
  return <AdminClaimDetailV2Page id={id} locale={locale} search={search.data} />;
}
