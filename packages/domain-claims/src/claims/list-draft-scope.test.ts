import type { SessionWithTenant } from '@interdomestik/shared-auth';
import { and } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { listDraftExclusion } from './list-draft-scope';

const dialect = new PgDialect();
const session = (role: string) => ({ user: { id: 'actor-1', role } }) as SessionWithTenant;
const render = (conditions: ReturnType<typeof listDraftExclusion>) =>
  dialect.sqlToQuery(and(...conditions)!);

describe('listDraftExclusion', () => {
  it.each(['staff_all', 'staff_queue', 'admin', 'agent_queue', 'staff_unassigned'] as const)(
    'keeps member drafts out of the %s listing for staff',
    scope => {
      const { sql, params } = render(listDraftExclusion(scope, session('staff')));
      expect(sql).toMatch(/not case[\s\S]+end in \(\$\d+\)/i);
      expect(params).toContain('draft');
    }
  );

  it('keeps the unassigned queue free of drafts for every role', () => {
    expect(listDraftExclusion('staff_unassigned', session('admin'))).toHaveLength(1);
  });

  it('leaves member self-service and non-staff operator listings unchanged', () => {
    expect(listDraftExclusion('member', session('staff'))).toEqual([]);
    expect(listDraftExclusion('member', session('member'))).toEqual([]);
    expect(listDraftExclusion('staff_all', session('admin'))).toEqual([]);
    expect(listDraftExclusion('staff_all', null)).toEqual([]);
  });
});
