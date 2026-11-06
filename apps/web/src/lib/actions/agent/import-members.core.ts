import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { ImportMemberRowInput } from './schemas';
import { importMemberRowSchema } from './schemas';
import { registerMemberCore } from './register-member.core';
import { forEachInOrder } from '@/lib/in-order';

type ImportMembersCoreParams = {
  agent: { id: string; name?: string | null };
  authority: TenantAuthority;
  branchId: string | null;
  rows: ImportMemberRowInput[];
};

type ImportMemberResult = {
  index: number;
  email: string;
  fullName: string;
  ok: boolean;
  error?: string;
};

export async function importMembersCore({
  agent,
  authority,
  branchId,
  rows,
}: ImportMembersCoreParams) {
  if (rows.length === 0) {
    return {
      summary: {
        total: 0,
        imported: 0,
        failed: 0,
      },
      results: [] as ImportMemberResult[],
      error: 'No rows to import',
    };
  }

  const results: ImportMemberResult[] = [];

  await forEachInOrder(rows.entries(), async ([index, row]) => {
    const validated = importMemberRowSchema.safeParse(row);

    if (!validated.success) {
      results.push({
        index,
        email: row.email,
        fullName: row.fullName,
        ok: false,
        error: 'Validation failed',
      });
      return;
    }

    const formData = new FormData();
    formData.set('fullName', validated.data.fullName);
    formData.set('email', validated.data.email);
    formData.set('phone', validated.data.phone);
    formData.set('planId', validated.data.planId);

    const result = await registerMemberCore(agent, authority, branchId, formData, {
      membershipMode: 'sponsored',
    });

    if (result.ok) {
      results.push({
        index,
        email: validated.data.email,
        fullName: validated.data.fullName,
        ok: true,
      });
      return;
    }

    results.push({
      index,
      email: validated.data.email,
      fullName: validated.data.fullName,
      ok: false,
      error: result.error,
    });
  });

  return {
    summary: {
      total: rows.length,
      imported: results.filter(result => result.ok).length,
      failed: results.filter(result => !result.ok).length,
    },
    results,
  };
}
