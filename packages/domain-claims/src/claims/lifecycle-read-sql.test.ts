import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

import {
  claimLifecycleStatusNotInForAlias,
  claimLifecycleStatusSqlForAlias,
} from './lifecycle-read-sql';

const dialect = new PgDialect();

describe('claim lifecycle read SQL', () => {
  it('renders raw subquery aliases instead of the base claim table', () => {
    const query = dialect.sqlToQuery(claimLifecycleStatusSqlForAlias('claims'));

    expect(query.sql).toContain('"claims"."case_lifecycle_state"');
    expect(query.sql).toContain('"claims"."recovery_lifecycle_state"');
    expect(query.sql).toContain('"claims"."status"');
    expect(query.sql).not.toContain('"claim"."case_lifecycle_state"');
  });

  it('renders alias-aware status predicates for hand-written subqueries', () => {
    const query = dialect.sqlToQuery(claimLifecycleStatusNotInForAlias('claims', ['resolved']));

    expect(query.sql).toContain('"claims"."case_lifecycle_state"');
    expect(query.sql).toContain('not');
    expect(query.params).toEqual(['resolved']);
  });

  it('rejects unsafe raw SQL aliases', () => {
    expect(() => claimLifecycleStatusSqlForAlias('claims; drop table claim')).toThrow(
      /Invalid claim SQL alias/u
    );
  });
});
