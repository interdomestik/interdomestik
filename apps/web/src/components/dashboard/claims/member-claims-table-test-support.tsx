import claims from '@/messages/en/claims.json';
import common from '@/messages/en/common.json';
import claimsSq from '@/messages/sq/claims.json';
import commonSq from '@/messages/sq/common.json';
import { screen } from '@testing-library/react';
import { vi } from 'vitest';

export const catalogues = {
  en: { ...claims, ...common },
  sq: { ...claimsSq, ...commonSq },
};

export function rowFor(text: string) {
  const row = screen.getByText(text).closest('tr');
  if (!row) throw new Error('Expected claim table row');
  return row;
}

export function mockFetch(body: unknown, init: { ok?: boolean } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: init.ok ?? true, json: async () => body })
  );
}

export function deferFetch() {
  let finish!: (response: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(
    new Promise<Response>(resolve => {
      finish = resolve;
    })
  );
  return finish;
}

export const mockClaims = [
  {
    id: 'claim-1',
    title: 'Car Accident',
    companyName: 'State Farm',
    category: 'auto',
    status: 'submitted',
    claimAmount: '5000',
    currency: 'EUR',
    createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'claim-2',
    title: 'Flight Delay',
    companyName: 'Lufthansa',
    category: 'travel',
    status: 'verification',
    claimAmount: '600',
    currency: 'EUR',
    createdAt: '2024-01-14T10:00:00Z',
  },
];
