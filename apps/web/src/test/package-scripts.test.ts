import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJsonPath = path.resolve(import.meta.dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
  scripts: Record<string, string>;
};

describe('web package build scripts', () => {
  it('pins production builds to webpack for standalone gate stability', () => {
    expect(packageJson.scripts.build).toContain('next build --webpack');
    expect(packageJson.scripts['build:ci']).toContain('next build --webpack');
  });
});
