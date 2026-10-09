import { vi } from 'vitest';

const fake = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type Predicate = { all?: Predicate[]; column?: string; value?: unknown };
  type Table = { tableName: string };
  type Chain = {
    for: () => Promise<Row[]>;
    from: (target: Table) => Chain;
    limit: () => Promise<Row[]>;
    where: (next: Predicate) => Chain;
  };
  const table = (tableName: string, columns: string[]) => ({
    tableName,
    ...Object.fromEntries(columns.map(name => [name, { name }])),
  });
  const state = {
    committed: {} as Record<string, Row[]>,
    contexts: [] as unknown[],
    faults: { insertTable: null as string | null, selectTable: null as string | null },
    reads: [] as Array<{ predicate?: Predicate; table: string }>,
    tail: Promise.resolve() as Promise<unknown>,
  };
  const matches = (row: Row, predicate?: Predicate): boolean => {
    if (!predicate) return true;
    if (predicate.all) return predicate.all.every(part => matches(row, part));
    return row[predicate.column ?? ''] === predicate.value;
  };
  const createTx = (rows: Record<string, Row[]>) => {
    const rowsOf = (name: string) => (rows[name] ??= []);
    // Models the primary key: a plain insert of an existing id raises SQLSTATE 23505.
    const insertRow = (name: string, values: Row) => {
      if (state.faults.insertTable === name) {
        throw new Error('new row violates row-level security policy');
      }
      if (values.id !== undefined && rowsOf(name).some(row => row.id === values.id)) {
        throw Object.assign(new Error(`duplicate key value violates ${name}_pkey`), {
          code: '23505',
        });
      }
      rowsOf(name).push({ ...values });
    };
    return {
      select: () => {
        let source = '';
        let predicate: Predicate | undefined;
        const read = async () => {
          state.reads.push({ predicate, table: source });
          if (state.faults.selectTable === source)
            throw new Error(`permission denied for ${source}`);
          return rowsOf(source)
            .filter(row => matches(row, predicate))
            .map(row => ({ ...row }));
        };
        const chain: Chain = {
          for: read,
          from: target => {
            source = target.tableName;
            return chain;
          },
          limit: read,
          where: next => {
            predicate = next;
            return chain;
          },
        };
        return chain;
      },
      insert: (target: Table) => ({
        values: (values: Row) => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              if (rowsOf(target.tableName).some(row => row.id === values.id)) return [];
              insertRow(target.tableName, values);
              return [{ id: values.id }];
            },
          }),
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve()
              .then(() => insertRow(target.tableName, values))
              .then(resolve, reject),
        }),
      }),
    };
  };
  const snapshot = () =>
    Object.fromEntries(
      Object.entries(state.committed).map(([name, list]) => [name, list.map(row => ({ ...row }))])
    );
  // Serialized transactions model PostgreSQL holding a conflicting insert until the first commits;
  // writes become visible only when the callback resolves, so a rejection rolls everything back.
  const withTenantContext = (context: unknown, action: (tx: unknown) => Promise<unknown>) => {
    const run = state.tail.then(async () => {
      state.contexts.push(context);
      const working = snapshot();
      const result = await action(createTx(working));
      state.committed = working;
      return result;
    });
    state.tail = run.catch(() => undefined);
    return run;
  };
  return {
    state,
    withTenantContext,
    tables: {
      auditLog: table('audit_log', []),
      claimDocuments: table('claim_documents', ['id', 'tenantId', 'claimId', 'uploadedBy']),
      claims: table('claims', ['id', 'tenantId', 'userId']),
      consents: table('claim_document_ai_extraction_consents', []),
      requestEvidence: table('claim_information_request_evidence', [
        'requestId',
        'documentId',
        'tenantId',
        'claimId',
      ]),
      requests: table('claim_information_requests', ['id', 'claimId', 'tenantId', 'status']),
    },
  };
});

vi.mock('@interdomestik/database', () => ({
  and: (...all: unknown[]) => ({ all }),
  auditLog: fake.tables.auditLog,
  claimDocumentAiExtractionConsents: fake.tables.consents,
  claimDocuments: fake.tables.claimDocuments,
  claimInformationRequestEvidence: fake.tables.requestEvidence,
  claimInformationRequests: fake.tables.requests,
  claims: fake.tables.claims,
  eq: (column: { name: string }, value: unknown) => ({ column: column.name, value }),
  withTenantContext: fake.withTenantContext,
}));

export const getReplayFixture = () => fake;
