import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
}));

import RegisterMemberPage from './_core.entry';

describe('RegisterMemberPage', () => {
  it.each(['en', 'sq'])(
    'retires direct registration: %s agents go to the leads workspace',
    async locale => {
      await expect(RegisterMemberPage({ params: Promise.resolve({ locale }) })).rejects.toThrow(
        `redirect:/${locale}/agent/leads`
      );
    }
  );
});
