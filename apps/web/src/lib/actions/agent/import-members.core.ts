import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { ImportMemberRowInput } from './schemas';
import { importMemberRowSchema } from './schemas';
import { registerMemberCore } from './register-member.core';

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
  code?: 'CLOSED';
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
  let closed = false;

  for (const [index, row] of rows.entries()) {
    const validated = importMemberRowSchema.safeParse(row);

    if (!validated.success) {
      results.push({
        index,
        email: row.email,
        fullName: row.fullName,
        ok: false,
        error: 'Validation failed',
      });
    } else {
      const formData = new FormData();
      formData.set('fullName', validated.data.fullName);
      formData.set('email', validated.data.email);
      formData.set('phone', validated.data.phone);
      formData.set('planId', validated.data.planId);

      const result = await registerMemberCore(agent, authority, branchId, formData, {
        membershipMode: 'sponsored',
      });

      const member = { index, email: validated.data.email, fullName: validated.data.fullName };
      if (result.ok) {
        results.push({ ...member, ok: true });
      } else if ('code' in result && result.code === 'CLOSED') {
        results.push({ ...member, ok: false, code: result.code });
        closed = true;
        break;
      } else {
        results.push({ ...member, ok: false, error: result.error });
      }
    }
  }

  const summary = {
    total: rows.length,
    imported: results.filter(result => result.ok).length,
    failed: results.filter(result => !result.ok).length,
  };
  if (closed) {
    return { summary, results, code: 'CLOSED' as const };
  }
  return { summary, results };
}
