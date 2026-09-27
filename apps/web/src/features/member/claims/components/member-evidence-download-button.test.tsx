import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('next-intl');

import en from '@/messages/en/claims.json';
import mk from '@/messages/mk/claims.json';
import sq from '@/messages/sq/claims.json';
import sr from '@/messages/sr/claims.json';
import { MemberEvidenceDownloadButton } from './member-evidence-download-button';

function signedResponse(url: string, name = 'repair-estimate.pdf'): Response {
  return new Response(JSON.stringify({ url, name, expiresIn: 300 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderButton(locale = 'en', messages = en) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <MemberEvidenceDownloadButton
        documentId="document/private 1"
        documentName="repair-estimate.pdf"
      />
    </NextIntlClientProvider>
  );
}

describe('MemberEvidenceDownloadButton', () => {
  const fetchMock = vi.fn();
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click');
  const clickedHrefs: string[] = [];

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    clickedHrefs.length = 0;
    anchorClick.mockImplementation(function (this: HTMLAnchorElement) {
      clickedHrefs.push(this.href);
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each([
    ['en', en],
    ['sq', sq],
    ['mk', mk],
    ['sr', sr],
  ])('renders a named keyboard button in %s', (locale, messages) => {
    renderButton(locale, messages);
    expect(
      screen.getByRole('button', { name: messages.claims.informationRequests.download })
    ).toBeEnabled();
  });

  it.each([
    ['en', en],
    ['sq', sq],
    ['mk', mk],
    ['sr', sr],
  ])('announces the localized preparing state in %s', async (locale, messages) => {
    fetchMock.mockImplementationOnce(() => new Promise<Response>(() => undefined));
    renderButton(locale, messages);

    fireEvent.click(
      screen.getByRole('button', { name: messages.claims.informationRequests.download })
    );

    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button').parentElement).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(
      messages.claims.informationRequests.downloadPreparing
    );
  });

  it.each([
    ['en', en],
    ['sq', sq],
    ['mk', mk],
    ['sr', sr],
  ])(
    'downloads through a fresh authorized attachment URL without instrumented storage fetch in %s',
    async (locale, messages) => {
      fetchMock.mockResolvedValueOnce(
        signedResponse('https://storage.example/private?token=fresh')
      );
      renderButton(locale, messages);

      fireEvent.click(
        screen.getByRole('button', { name: messages.claims.informationRequests.download })
      );

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          messages.claims.informationRequests.downloadSuccess
        )
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        '/api/documents/document%2Fprivate%201',
        expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' })
      );
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(anchorClick).toHaveBeenCalledOnce();
      expect(clickedHrefs).toEqual(['https://storage.example/private?token=fresh']);
    }
  );

  it('discards the prior URL and re-authorizes on a later activation', async () => {
    fetchMock
      .mockResolvedValueOnce(signedResponse('https://storage.example/private?token=expired'))
      .mockResolvedValueOnce(signedResponse('https://storage.example/private?token=renewed'));
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Download started'));
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(clickedHrefs).toEqual([
      'https://storage.example/private?token=expired',
      'https://storage.example/private?token=renewed',
    ]);
  });

  it.each([
    ['en', en],
    ['sq', sq],
    ['mk', mk],
    ['sr', sr],
  ])(
    'shows localized retryable feedback without touching storage after denial in %s',
    async (locale, messages) => {
      fetchMock.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));
      renderButton(locale, messages);

      fireEvent.click(
        screen.getByRole('button', { name: messages.claims.informationRequests.download })
      );

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          messages.claims.informationRequests.downloadError
        )
      );
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(
        screen.getByRole('button', { name: messages.claims.informationRequests.download })
      ).toBeEnabled();
      expect(anchorClick).not.toHaveBeenCalled();
    }
  );

  it('keeps one retrieval in flight for repeated activation', async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          resolveRequest = resolve;
        })
    );
    renderButton();
    const button = screen.getByRole('button', { name: 'Download' });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(fetchMock).toHaveBeenCalledOnce();
    resolveRequest?.(new Response('Forbidden', { status: 403 }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled());
  });
});
