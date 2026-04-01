import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

describe('next.config sentry tunnel route', () => {
  it('keeps the Sentry tunnel under /api so proxy-protected app surfaces do not intercept it', async () => {
    const configSource = await readFile(path.join(process.cwd(), 'next.config.mjs'), 'utf8');

    expect(configSource).toContain("tunnelRoute: '/api/monitoring'");
  });
});
