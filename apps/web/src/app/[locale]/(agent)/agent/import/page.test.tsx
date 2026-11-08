import { redirect } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';
import AgentImportPage from './page';

describe('retired agent import', () => {
  it.each(['en', 'sq', 'mk', 'sr', 'de'])(
    'redirects to the protected sponsor area in %s',
    async locale => {
      vi.mocked(redirect).mockImplementationOnce(url => {
        throw new Error(`redirect:${url}`);
      });
      await expect(AgentImportPage({ params: Promise.resolve({ locale }) })).rejects.toThrow(
        `redirect:/${locale}/agent/sponsors`
      );
    }
  );
});
