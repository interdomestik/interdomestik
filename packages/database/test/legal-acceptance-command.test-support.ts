import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import de from '../../../apps/web/src/messages/de/legal-documents.json';
import en from '../../../apps/web/src/messages/en/legal-documents.json';
import { withDisposableClient } from '../src/disposable-client';
import { migrateJournal, type ScratchClient } from './pg16/scratch-database';
import { quoteIdentifier, quoteSqlLiteral } from './rls-test-connection';

export const cleanup = 'interdomestik_seed_cleanup';
const journal = fileURLToPath(new URL('../drizzle', import.meta.url));

export async function withAcceptanceRuntime(
  admin: ScratchClient,
  scratchUrl: URL,
  work: (client: ScratchClient, url: string) => Promise<void>
) {
  const username = `wp13_acceptance_${randomUUID().replaceAll('-', '')}`;
  const login = quoteIdentifier(username);
  const password = randomUUID();
  await admin.begin(async tx => {
    await tx.unsafe(
      `create role ${login} login noinherit nosuperuser nobypassrls password ${quoteSqlLiteral(password)}`
    );
    await tx.unsafe(`grant interdomestik_runtime_rls to ${login}`);
  });
  try {
    const url = new URL(scratchUrl);
    url.username = username;
    url.password = password;
    await withDisposableClient(
      url.toString(),
      { applicationName: 'wp13_acceptance', max: 2 },
      client => work(client, url.toString())
    );
  } finally {
    await admin.unsafe(`drop role ${login}`);
  }
}

type FixtureText = string | { [key: string]: FixtureText };

function valuesOf(value: FixtureText): string[] {
  return typeof value === 'string' ? [value] : Object.values(value).flatMap(valuesOf);
}

export async function migrateApprovedFixture(admin: ScratchClient) {
  // Publish a synthetic approved translation while keeping the real pending English rows. The
  // test uses all the journal's real constraints, policies, grants and triggers.
  const fixture = await mkdtemp(path.join(tmpdir(), 'wp13-approved-journal-'));
  try {
    await cp(journal, fixture, { recursive: true });
    const migration = path.join(fixture, '0102_wp13a_legal_acceptance.sql');
    const sql = await readFile(migration, 'utf8');
    const pendingGerman = /('de', '[a-f0-9]{64}', )'legal_review_pending'/gu;
    assert.equal([...sql.matchAll(pendingGerman)].length, 2);
    await writeFile(migration, sql.replace(pendingGerman, "$1'approved'"));
    await migrateJournal(admin, fixture);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

export async function seedSubject(
  admin: ScratchClient,
  id: string,
  tenantId: string,
  email: string
) {
  await admin`insert into "user" (id, tenant_id, name, email, "emailVerified", role, "createdAt", "updatedAt")
    values (${id}, ${tenantId}, 'Acceptance fixture', ${email}, true, 'member', now(), now())`;
}

export function fixtureWithText(
  documents: readonly { kind: 'terms' | 'privacy_notice'; version: string }[],
  locale: 'en' | 'de',
  requireApproved: boolean
) {
  const translations = (locale === 'en' ? en : de)['legal-documents'];
  return {
    locale,
    requireApproved,
    texts: documents.map(doc => {
      const versions: Readonly<Record<string, FixtureText>> = translations[doc.kind];
      assert.ok(versions[doc.version], 'expected current fixture text');
      return { ...doc, values: valuesOf(versions[doc.version]) };
    }),
  };
}

export async function acceptanceEvidence(admin: ScratchClient, actor: string) {
  const rows = await admin`
    select a.document_kind, a.locale, a.text_sha256, evidence.metadata
    from legal_acceptances a
    left join audit_log evidence on evidence.entity_id = a.id
      and evidence.tenant_id = a.tenant_id and evidence.actor_id = a.subject_user_id
      and evidence.action = 'privacy.legal_document_accepted'
    where a.subject_user_id = ${actor}
    order by a.document_kind
  `;
  return [...rows];
}

export async function verifyReseed(admin: ScratchClient, pendingActor: string) {
  const { cleanSeededLegalAcceptance, seedLegalAcceptance } =
    await import('../src/seed-golden/index');
  const { buildUsersToSeed } = await import('../src/seed-golden/users');
  const fixture = buildUsersToSeed({ at: () => new Date() }).find(
    candidate => candidate.role === 'member'
  );
  assert.ok(fixture);
  await admin`insert into tenants (id, name, legal_name, country_code)
    values (${fixture.tenantId}, 'Seed fixture', 'Seed fixture', 'MK')`;
  await seedSubject(admin, fixture.id, fixture.tenantId, fixture.email);
  const readFixture = async () => {
    const rows =
      await admin`select id from legal_acceptances where subject_user_id = ${fixture.id} order by id`;
    return [...rows];
  };

  await seedLegalAcceptance();
  const before = await readFixture();
  assert.equal(before.length, 2);
  await cleanSeededLegalAcceptance();
  const [role] = await admin`select rolcanlogin from pg_roles where rolname = ${cleanup}`;
  assert.deepEqual(role, { rolcanlogin: false });
  assert.deepEqual(await readFixture(), []);
  assert.equal((await acceptanceEvidence(admin, pendingActor)).length, 2);
  await seedLegalAcceptance();
  const after = await readFixture();
  assert.equal(after.length, 2);
  assert.notDeepEqual(after, before);
}
