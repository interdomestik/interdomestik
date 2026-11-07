import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
}));

import NewLeadPage from './_core.entry';

describe('NewLeadPage', () => {
  it.each(['en', 'sq'])(
    'sends %s agents to the leads workspace and its consent dialog',
    async locale => {
      await expect(NewLeadPage({ params: Promise.resolve({ locale }) })).rejects.toThrow(
        `redirect:/${locale}/agent/leads`
      );
    }
  );
});
