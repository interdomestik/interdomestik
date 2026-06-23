import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const sourceDir = dirname(fileURLToPath(import.meta.url));
const productionFiles = readdirSync(sourceDir)
  .filter(file => file.endsWith('.ts'))
  .filter(file => !file.endsWith('.test.ts') && file !== 'test-support.ts')
  .sort();

const forbiddenWritePatterns = [
  /@interdomestik\/database/u,
  /\bdb\./u,
  /\.insert\s*\(/u,
  /\.update\s*\(/u,
  /\.delete\s*\(/u,
  /\.upsert\s*\(/u,
  /\.create\s*\(/u,
  /\.createMany\s*\(/u,
  /\.updateMany\s*\(/u,
  /\.save\s*\(/u,
  /\.\$executeRaw(?:Unsafe)?\b/u,
  /\.\$queryRaw(?:Unsafe)?\b/u,
  /\bfetch\s*\(/u,
  /\btransaction\s*\(/u,
  /membership\.entity_migrated/u,
  /\bappendEvent\b/u,
  /\bemitEvent\b/u,
] as const;

describe('entity migration readiness dry-run no-write proof', () => {
  it('keeps the readiness surface free of database and migration-write operations', () => {
    for (const file of productionFiles) {
      const source = readFileSync(join(sourceDir, file), 'utf8');

      for (const pattern of forbiddenWritePatterns) {
        expect(source, `${file} must not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
