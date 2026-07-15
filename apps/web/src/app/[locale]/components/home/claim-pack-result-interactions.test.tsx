import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { enFreeStartMessages as en } from '@/messages/free-start-test-messages';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createClaimPack } from './claim-pack-result.test-fixtures';

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => en),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { ClaimPackResult } from './claim-pack-result';

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

function setClipboard(clipboard: Pick<Clipboard, 'writeText'> | undefined) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else Reflect.deleteProperty(navigator, 'clipboard');
  if (createObjectUrlDescriptor)
    Object.defineProperty(URL, 'createObjectURL', createObjectUrlDescriptor);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (revokeObjectUrlDescriptor)
    Object.defineProperty(URL, 'revokeObjectURL', revokeObjectUrlDescriptor);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('ClaimPackResult letter interactions', () => {
  it('copies the exact generated letter and announces success', async () => {
    const user = userEvent.setup();
    const pack = createClaimPack();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<ClaimPackResult ctaHref="/pricing" ctaLabel="Continue" pack={pack} />);

    await user.click(screen.getByRole('button', { name: 'Copy letter' }));

    expect(writeText).toHaveBeenCalledWith(pack.letter.body);
    expect(screen.getByText('Letter copied.', { selector: '[role="status"]' })).toBeInTheDocument();
  });

  it('announces manual guidance when clipboard access is unavailable', async () => {
    const user = userEvent.setup();
    setClipboard(undefined);
    render(<ClaimPackResult ctaHref="/pricing" ctaLabel="Continue" pack={createClaimPack()} />);

    await user.click(screen.getByRole('button', { name: 'Copy letter' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Copying was unavailable. Select the letter text and copy it manually.'
    );
  });

  it('downloads the exact generated body with the existing filename', async () => {
    const user = userEvent.setup();
    const pack = createClaimPack();
    const createObjectURL = vi.fn().mockReturnValue('blob:claim-letter');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    render(<ClaimPackResult ctaHref="/pricing" ctaLabel="Continue" pack={pack} />);
    const anchor = document.createElement('a');
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(tag =>
      tag === 'a' ? anchor : originalCreateElement(tag)
    );
    vi.spyOn(anchor, 'click').mockImplementation(() => undefined);

    await user.click(screen.getByRole('button', { name: 'Download letter' }));

    expect(anchor.download).toBe('complaint-letter.txt');
    expect(await readBlob(createObjectURL.mock.calls[0][0] as Blob)).toBe(pack.letter.body);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:claim-letter');
  });
});
