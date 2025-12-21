import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaInstallButton } from './install-button';

describe('PwaInstallButton', () => {
  beforeEach(() => {
    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // Deprecated
        removeListener: vi.fn(), // Deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    // Reset userAgent mock
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true,
    });
  });

  it('renders nothing initially (desktop, no event)', () => {
    const { container } = render(<PwaInstallButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders button when beforeinstallprompt fires', async () => {
    render(<PwaInstallButton />);

    // Simulate event
    const event = new Event('beforeinstallprompt');
    // @ts-expect-error - mocking custom properties
    event.prompt = vi.fn();
    // @ts-expect-error - mocking custom properties
    event.userChoice = Promise.resolve({ outcome: 'accepted' });

    fireEvent(window, event);

    expect(await screen.findByText('Install App')).toBeInTheDocument();
  });

  it('renders iOS instructions on iPhone', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      configurable: true,
    });

    render(<PwaInstallButton />);

    expect(screen.getByText(/Install for better experience/)).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
  });

  it('renders nothing if already standalone', () => {
    // Mock standalone match
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    const { container } = render(<PwaInstallButton />);
    expect(container).toBeEmptyDOMElement();
  });
});
