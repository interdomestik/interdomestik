import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVIDENCE_FORMATS } from './evidence-file-policy';

describe('claim evidence bucket migration', () => {
  it('sets exactly the shared canonical MIME types and 50 MB without changing access policies', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        '../../supabase/migrations/20261112101801_claim_evidence_approved_formats.sql'
      ),
      'utf8'
    );
    const array = sql.match(/allowed_mime_types\s*=\s*ARRAY\[([\s\S]*?)\]/)?.[1] ?? '';
    const mimeTypes = [...array.matchAll(/'([^']+)'/g)].map(match => match[1]);
    expect(mimeTypes.sort()).toEqual(
      [...new Set(EVIDENCE_FORMATS.map(format => format.mimeType))].sort()
    );
    expect(sql).toMatch(/file_size_limit\s*=\s*52428800/);
    expect(sql).toMatch(/UPDATE storage\.buckets/);
    expect(sql).toMatch(/WHERE id = 'claim-evidence'/);
    expect(sql).not.toMatch(/CREATE POLICY|DROP POLICY|SET public|INSERT INTO|DELETE FROM/i);
  });
});
