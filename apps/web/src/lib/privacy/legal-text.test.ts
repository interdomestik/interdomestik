// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { LOCALES } from '@/i18n/locales';
import {
  currentLegalDocuments,
  digestLegalDocument,
} from '@interdomestik/domain-privacy/acceptance';
import { expect, it, vi } from 'vitest';
import { renderLegalTexts } from './legal-text';

vi.unmock('next-intl');

const root = new URL('../../../../../', import.meta.url);
const registry = JSON.parse(
  readFileSync(new URL('packages/database/src/legal-document-versions.json', root), 'utf8')
);
const migration = readFileSync(
  new URL('packages/database/drizzle/0106_wp13a_legal_acceptance.sql', root),
  'utf8'
);

it('binds every pending version to the rendered catalogue and migration row', () => {
  const seen = [];
  for (const locale of LOCALES) {
    const ui = JSON.parse(
      readFileSync(
        fileURLToPath(new URL(`../../messages/${locale}/legal-acceptance.json`, import.meta.url)),
        'utf8'
      )
    );
    const rendered = renderLegalTexts(locale, currentLegalDocuments);
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) throw new Error('Current documents must render');
    for (const { kind, version, values } of rendered.texts) {
      expect(values.length).toBeGreaterThan(1);
      expect(values.every(value => value.startsWith(ui['legal-acceptance'].reviewPending))).toBe(
        true
      );
      seen.push({
        kind,
        version,
        locale,
        textSha256: digestLegalDocument(values),
        reviewStatus: 'legal_review_pending',
      });
    }
  }
  expect(registry).toEqual(seen);
  const insert = migration.split('INSERT INTO public.legal_document_versions')[1];
  const projection =
    /SELECT document\.kind, '([^']+)', source\.locale, document\.text_sha256, '([^']+)'/u.exec(
      insert
    );
  expect(projection).not.toBeNull();
  const [, version, reviewStatus] = projection!;
  const [source, documents] = insert.split('CROSS JOIN LATERAL');
  const digestsByLocale = Array.from(
    source.matchAll(/\('([^']+)', '([0-9a-f]{64})', '([0-9a-f]{64})'\)/gu),
    ([, locale, terms, notice]) => ({
      locale,
      digests: { terms_sha256: terms, privacy_notice_sha256: notice } as Record<string, string>,
    })
  );
  expect(source).toContain('AS source(locale, terms_sha256, privacy_notice_sha256)');
  expect(documents).toContain('AS document(kind, text_sha256)');
  const kinds = Array.from(documents.matchAll(/\('([^']+)', source\.(\w+)\)/gu));
  const sqlRows = digestsByLocale.flatMap(({ locale, digests }) =>
    kinds.map(([, kind, field]) => ({
      kind,
      version,
      locale,
      textSha256: digests[field],
      reviewStatus,
    }))
  );
  expect(sqlRows).toEqual(registry);
});

it('refuses unsupported locales and missing versions', () => {
  expect(renderLegalTexts('toString', currentLegalDocuments)).toMatchObject({ ok: false });
  expect(renderLegalTexts('en', [{ kind: 'terms', version: 'absent' }])).toMatchObject({
    ok: false,
    code: 'legal_text_mismatch',
  });
});
