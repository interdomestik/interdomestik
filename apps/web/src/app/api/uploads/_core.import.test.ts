// @vitest-environment node
import { expect, it, vi } from 'vitest';

vi.mock('@/lib/storage/object-prefix', () => {
  throw new Error('object-prefix loaded during core import');
});
vi.mock('@/lib/storage/service-role', () => {
  throw new Error('service-role loaded during core import');
});

it('imports upload core in Node without loading server-only storage', async () => {
  const core = await import('./_core');
  expect(core.createSignedUploadCore).toBeTypeOf('function');
});
