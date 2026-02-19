import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function getArrayBlock(source: string, arrayName: string): string {
  const startToken = `export const ${arrayName} = [`;
  const start = source.indexOf(startToken);
  if (start === -1) {
    throw new Error(`Array ${arrayName} not found in messages.ts`);
  }
  const afterStart = source.slice(start + startToken.length);
  const end = afterStart.indexOf('] as const;');
  if (end === -1) {
    throw new Error(`Array ${arrayName} end marker not found in messages.ts`);
  }
  return afterStart.slice(0, end);
}

describe('i18n shell namespace coverage', () => {
  it('includes dashboard namespace on all portal shells', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'messages.ts'), 'utf8');
    const app = getArrayBlock(source, 'APP_NAMESPACES');
    const agent = getArrayBlock(source, 'AGENT_NAMESPACES');
    const staff = getArrayBlock(source, 'STAFF_NAMESPACES');
    const admin = getArrayBlock(source, 'ADMIN_NAMESPACES');

    expect(app).toContain("'dashboard'");
    expect(agent).toContain("'dashboard'");
    expect(staff).toContain("'dashboard'");
    expect(admin).toContain("'dashboard'");
  });
});
