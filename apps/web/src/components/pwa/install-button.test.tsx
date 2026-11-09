import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaInstallButton } from './install-button';

describe('existing PWA install guidance', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_PWA', 'true');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android');
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  function dispatchPrompt(outcome: 'accepted' | 'dismissed') {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: 'web' }) });
    act(() => {
      window.dispatchEvent(event);
    });
    return { event, prompt };
  }
  it('renders nothing before a browser install prompt', () => {
    expect(render(<PwaInstallButton />).container).toBeEmptyDOMElement();
  });
  it('uses a translated default install label', () => {
    render(<PwaInstallButton />);
    dispatchPrompt('dismissed');
    expect(screen.getByRole('button', { name: 'install' })).toBeInTheDocument();
  });
  it('hides when the browser is already standalone', () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    expect(render(<PwaInstallButton />).container).toBeEmptyDOMElement();
  });
  it.each(['accepted', 'dismissed'] as const)('consumes a prompt once after %s', async outcome => {
    render(<PwaInstallButton label="Install" />);
    const { prompt, event } = dispatchPrompt(outcome);
    expect(event.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() => expect(screen.queryByRole('button')).not.toBeInTheDocument());
    expect(prompt).toHaveBeenCalledOnce();
  });
  it('hides after installation from another browser surface', () => {
    render(<PwaInstallButton label="Install" />);
    dispatchPrompt('dismissed');
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('uses localized iOS instructions', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
    render(<PwaInstallButton />);
    expect(screen.getByText('iosInstructions')).toBeInTheDocument();
  });
  it('hides guidance in iOS standalone mode', () => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    render(<PwaInstallButton />);
    expect(screen.queryByText('iosInstructions')).not.toBeInTheDocument();
    Reflect.deleteProperty(navigator, 'standalone');
  });
  it('does not offer installation while PWA is disabled', () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_PWA', 'false');
    render(<PwaInstallButton label="Install" />);
    dispatchPrompt('dismissed');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
