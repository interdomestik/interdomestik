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
    // Each body runs when called and reports failure through the returned Promise, as the previous
    // async functions did. Only the plain insert is deferred, and only until it is awaited.
    const readTable = (name: string, predicate?: Predicate) =>
      new Promise<Row[]>(resolve => {
        state.reads.push({ predicate, table: name });
        if (state.faults.selectTable === name) throw new Error(`permission denied for ${name}`);
        resolve(
          rowsOf(name)
            .filter(row => matches(row, predicate))
            .map(row => ({ ...row }))
        );
      });
    const returningInserted = (name: string, values: Row) =>
      new Promise<Row[]>(resolve => {
        if (rowsOf(name).some(row => row.id === values.id)) {
          resolve([]);
          return;
        }
        insertRow(name, values);
        resolve([{ id: values.id }]);
      });
    // Created only when the thenable is awaited; a synchronous throw becomes a rejection.
    const deferInsert = (name: string, values: Row) =>
      Promise.resolve().then(() => insertRow(name, values));
    // Intentional lazy thenable modeling Drizzle's awaitable insert().values(): the plain insert
    // runs only when awaited, and onConflictDoNothing().returning() never triggers it.
    const insertBuilder = (name: string, values: Row) => ({
      onConflictDoNothing: () => ({ returning: () => returningInserted(name, values) }),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        deferInsert(name, values).then(resolve, reject),
    });
    return {
      select: () => {
        let source = '';
        let predicate: Predicate | undefined;
        const read = () => readTable(source, predicate);
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
        values: (values: Row) => insertBuilder(target.tableName, values),
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
