import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SCHEMA_FILES = [
  {
    file: '../src/schema/claims.ts',
    names: ['claims', 'claimDocuments'],
  },
  {
    file: '../src/schema/claim-commercial.ts',
    names: ['claimEscalationAgreements'],
  },
  {
    file: '../src/schema/claim-recovery-no-fee.ts',
    names: ['claimRecoveryNoFeeEvidence'],
  },
  {
    file: '../src/schema/domain-events.ts',
    names: ['domainEvents'],
  },
] as const;

function source(file: string): string {
  return readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
}

test('T-305b divergent table schemas expose accessTenantId columns', () => {
  for (const entry of SCHEMA_FILES) {
    const text = source(entry.file);

    for (const name of entry.names) {
      assert.match(text, new RegExp(`export const ${name} = pgTable`, 'u'));
    }

    assert.match(text, /accessTenantId: text\('access_tenant_id'\)\.references/u);
  }
});

test('T-305b claim document schema declares access tenant index', () => {
  assert.match(
    source('../src/schema/claims.ts'),
    /index\('claim_documents_access_tenant_idx'\)\.on\(table\.accessTenantId\)/u
  );
});
