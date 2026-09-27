import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('next-intl');

import en from '@/messages/en/claims.json';
import mk from '@/messages/mk/claims.json';
import sq from '@/messages/sq/claims.json';
import sr from '@/messages/sr/claims.json';
import { MemberEvidenceDownloadButton } from './member-evidence-download-button';

function signedResponse(
  url: string,
  name = 'repair-estimate.pdf',
  delivery?: 'authenticated-proxy'
): Response {
  return new Response(JSON.stringify({ url, name, expiresIn: 300, delivery }), {
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
  const createObjectURL = vi.spyOn(URL, 'createObjectURL');
  const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    createObjectURL.mockReset().mockReturnValue('blob:member-evidence');
    revokeObjectURL.mockReset().mockImplementation(() => undefined);
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
    'downloads a fresh authorized attachment as a local object URL in %s',
    async (locale, messages) => {
      const signedUrl = 'https://storage.example/storage/v1/object/sign/private/file?token=fresh';
      fetchMock
        .mockResolvedValueOnce(signedResponse(signedUrl))
        .mockResolvedValueOnce(new Response('document bytes', { status: 200 }));
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
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        signedUrl,
        expect.objectContaining({
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        })
      );
      expect(anchorClick).toHaveBeenCalledOnce();
      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(clickedHrefs).toEqual(['blob:member-evidence']);
    }
  );

  it('discards a rejected URL and re-authorizes once before downloading', async () => {
    const expiredUrl = 'https://storage.example/storage/v1/object/sign/private/file?token=expired';
    const renewedUrl = 'https://storage.example/storage/v1/object/sign/private/file?token=renewed';
    fetchMock
      .mockResolvedValueOnce(signedResponse(expiredUrl))
      .mockResolvedValueOnce(new Response('Expired', { status: 403 }))
      .mockResolvedValueOnce(signedResponse(renewedUrl))
      .mockResolvedValueOnce(new Response('document bytes', { status: 200 }));
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Download started'));

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenNthCalledWith(2, expiredUrl, expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(4, renewedUrl, expect.any(Object));
    expect(clickedHrefs).toEqual(['blob:member-evidence']);
  });

  it('uses the authenticated same-origin proxy only for the deterministic E2E response', async () => {
    const proxyPath = '/api/documents/document%2Fprivate%201/download';
    const proxyUrl = `${window.location.origin}/api/documents/document%2Fprivate%201/download`;
    fetchMock
      .mockResolvedValueOnce(
        signedResponse(proxyPath, 'repair-estimate.pdf', 'authenticated-proxy')
      )
      .mockResolvedValueOnce(new Response('deterministic bytes', { status: 200 }));
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Download started'));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      proxyUrl,
      expect.objectContaining({ credentials: 'same-origin', referrerPolicy: 'no-referrer' })
    );
  });

  it('rejects an authenticated proxy response for another origin', async () => {
    fetchMock.mockResolvedValueOnce(
      signedResponse(
        'https://attacker.example/api/documents/document-1/download',
        'repair-estimate.pdf',
        'authenticated-proxy'
      )
    );
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        en.claims.informationRequests.downloadError
      )
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(anchorClick).not.toHaveBeenCalled();
  });

  it('starts a later activation with a fresh authorization', async () => {
    fetchMock
      .mockResolvedValueOnce(
        signedResponse('https://storage.example/storage/v1/object/sign/private/file?token=first')
      )
      .mockResolvedValueOnce(new Response('first bytes', { status: 200 }))
      .mockResolvedValueOnce(
        signedResponse('https://storage.example/storage/v1/object/sign/private/file?token=second')
      )
      .mockResolvedValueOnce(new Response('second bytes', { status: 200 }));
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Download started'));
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/documents/document%2Fprivate%201');
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/documents/document%2Fprivate%201');
  });

  it('stops after one rejected-URL re-authorization', async () => {
    fetchMock
      .mockResolvedValueOnce(
        signedResponse('https://storage.example/storage/v1/object/sign/private/file?token=first')
      )
      .mockResolvedValueOnce(new Response('Expired', { status: 403 }))
      .mockResolvedValueOnce(
        signedResponse('https://storage.example/storage/v1/object/sign/private/file?token=second')
      )
      .mockResolvedValueOnce(new Response('Still forbidden', { status: 403 }));
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        en.claims.informationRequests.downloadError
      )
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(anchorClick).not.toHaveBeenCalled();
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
