'use server';

import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import { claims } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'verification'
  | 'evaluation'
  | 'negotiation'
  | 'court'
  | 'resolved'
  | 'rejected';

export async function updateClaimStatus(formData: FormData) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  const claimId = formData.get('claimId') as string;
  const status = formData.get('status') as ClaimStatus;
  const locale = formData.get('locale') as string;

  if (!claimId || !status) {
    throw new Error('Missing required fields');
  }

  // Validate status value
  const validStatuses: ClaimStatus[] = [
    'draft',
    'submitted',
    'verification',
    'evaluation',
    'negotiation',
    'court',
    'resolved',
    'rejected',
  ];

  if (!validStatuses.includes(status)) {
    throw new Error('Invalid status');
  }

  await db
    .update(claims)
    .set({
      status: status,
      updatedAt: new Date(),
    })
    .where(eq(claims.id, claimId));

  revalidatePath(`/${locale}/admin/claims`);
  revalidatePath(`/${locale}/admin/claims/${claimId}`);

  redirect(`/${locale}/admin/claims/${claimId}`);
}
