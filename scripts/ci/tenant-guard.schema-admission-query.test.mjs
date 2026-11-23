import assert from 'node:assert/strict';
import test from 'node:test';
import { append, refuses, scan, snapshot } from './tenant-guard-schema-test-support.mjs';

const FILE = 'packages/database/src/retained-consumer.ts';
const DB_IMPORT = "import { db } from './db';\n";
const check = (text, files = {}) => {
  const changes = { ...files, [FILE]: text };
  return scan(append(changes), { base: snapshot(changes) });
};

for (const [name, source] of [
  ['search params', `
    interface Props { initialParams: { query: string } }
    export const screen = ({ initialParams }: Props) => ({ query: initialParams.query });
    export async function read(searchParams: Promise<{ query?: string }>) {
      const params = await searchParams;
      return params.query || '';
    }
  `],
  ['SQL check', `${DB_IMPORT}
    import { sql, type SQL } from 'drizzle-orm';
    type Check = Readonly<{ query: SQL }>;
    const checks: readonly Check[] = [{ query: sql\`select 1\` }];
    export const read = () => checks.map(check => db.execute(check.query));
  `],
  ['pg client', `
    import * as pg from 'pg';
    export const read = (text: string, params: unknown[]) => {
      const client = new pg.Client();
      return client.query(text, params);
    };
  `],
  ['Sentry alert payload', `
    const alerts = [{ name: 'SLO', query: 'slo_alert:fixture' }];
    export const buildPayloads = () => alerts.map(alert => ({
      name: alert.name,
      query: alert.query,
    }));
  `],
]) {
  test(`a retained ${name} can use its non-Drizzle query property`, () => {
    const result = check(source);
    assert.equal(result.schemaAdmission.ok, true, result.schemaAdmission.reason);
  });
}

for (const [name, source] of [
  ['transaction parameter alias', `${DB_IMPORT}
    export const read = key => db.transaction(tx => {
      const client = tx;
      const map = client.query;
      return map[key];
    });
  `],
  ['namespace and assigned client aliases', `
    import * as database from './db';
    export const read = key => {
      let client;
      client = database.dbRls;
      return client['query'][key];
    };
  `],
  ['client assignment after a record initializer', `${DB_IMPORT}
    export const read = () => {
      let client = { query: 'search' };
      client = db;
      return client.query;
    };
  `],
  ['unresolved receiver', 'export const read = receiver => ({ query: receiver.query });'],
  ['unresolved receiver with a literal key', 'export const read = receiver => receiver.query.users;'],
  ['unresolved element selection after query', `${DB_IMPORT}
    export const read = key => db.query[key];
  `],
  ['empty element selection after query', `${DB_IMPORT}
    export const read = () => db.query[''];
  `],
  ['client passed through a record type assertion', `${DB_IMPORT}
    const read = (record: { query: string }) => ({ query: record.query });
    export const call = () => read(db as unknown as { query: string });
  `],
  ['JSON parser with an unresolved reviver', `
    export const read = args => {
      const receiver = JSON.parse(...args);
      return receiver.query;
    };
  `],
  ['aliased import passed as a value', `
    import { db as client } from './db';
    export const read = consume => consume(client.query);
  `],
]) {
  test(`a retained ${name} still requires a static query selection`, () => {
    refuses(check(source), `candidate: unproven dynamic schema consumer ${FILE}`);
  });
}

for (const [module, entry] of [
  ['./tenant', 'withTenantContext'],
  ['./tenant', 'withTenantDb'],
  ['./tenant-authority-context', 'withTenantAuthority'],
]) {
  test(`${entry} resolves its callback transaction even when both are aliased`, () => {
    const source = `
      import { ${entry} as withScope } from '${module}';
      const run = withScope;
      export const read = scope => run(scope, tx => {
        let client;
        client = tx;
        return client.query.REPLACE;
      });
    `;
    const safe = check(source.replace('REPLACE', 'users'));
    assert.equal(safe.schemaAdmission.ok, true, safe.schemaAdmission.reason);
    refuses(
      check(source.replace('REPLACE', 'rates')),
      `candidate: unproven dynamic schema consumer ${FILE}`
    );
  });
}
