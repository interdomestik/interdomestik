import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.resolve(__dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
  scripts: Record<string, string>;
};

describe('web package build scripts', () => {
  it('pins production builds to webpack for standalone gate stability', () => {
    expect(packageJson.scripts.build).toContain('next build --webpack');
    expect(packageJson.scripts['build:ci']).toContain('next build --webpack');
  });
});
