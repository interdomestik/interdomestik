/**
 * Test Utilities
 *
 * Custom render functions and utilities for testing React components.
 */

import { render, RenderOptions } from '@testing-library/react';
import { ReactElement, ReactNode } from 'react';
import { expect, vi } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK PROVIDERS
// ═══════════════════════════════════════════════════════════════════════════════

interface MockProvidersProps {
  children: ReactNode;
  locale?: string;
  messages?: Record<string, unknown>;
}

/**
 * Wrapper component that provides all necessary context providers for testing.
 */
function MockProviders({
  children,
  locale = 'en',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  messages = {},
}: MockProvidersProps) {
  // In a real implementation, you would wrap with actual providers:
  // - NextIntlClientProvider
  // - AuthProvider
  // - ThemeProvider
  // - etc.

  // For now, we return children directly since we mock at the module level
  return (
    <div data-testid="test-wrapper" data-locale={locale}>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOM RENDER
// ═══════════════════════════════════════════════════════════════════════════════

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  locale?: string;
  messages?: Record<string, unknown>;
}

/**
 * Custom render function that wraps components with necessary providers.
 *
 * @example
 * ```tsx
 * const { getByText } = renderWithProviders(<MyComponent />);
 * expect(getByText('Hello')).toBeInTheDocument();
 * ```
 */
export function renderWithProviders(
  ui: ReactElement,
  { locale = 'en', messages = {}, ...renderOptions }: CustomRenderOptions = {}
) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MockProviders locale={locale} messages={messages}>
      {children}
    </MockProviders>
  );

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Wait for all pending promises to resolve.
 * Useful when testing async operations.
 */
export const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Wait for a specific amount of time.
 * Use sparingly - prefer waitFor from testing-library.
 */
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Create a mock function that resolves after a delay.
 * Useful for simulating API calls.
 */
export const createAsyncMock = <T,>(value: T, delay = 100) =>
  vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(value), delay)));

/**
 * Create a mock FormData from an object.
 */
export const createFormData = (data: Record<string, string>): FormData => {
  const formData = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    formData.append(key, value);
  });
  return formData;
};

// ═══════════════════════════════════════════════════════════════════════════════
// ASSERTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Assert that an element is visible and not disabled.
 */
export const expectEnabled = (element: HTMLElement) => {
  expect(element).toBeVisible();
  expect(element).not.toBeDisabled();
};

/**
 * Assert that an element is visible and disabled.
 */
export const expectDisabled = (element: HTMLElement) => {
  expect(element).toBeVisible();
  expect(element).toBeDisabled();
};

/**
 * Assert form field has error.
 */
export const expectFieldError = (container: HTMLElement, fieldName: string, errorText: string) => {
  const field = container.querySelector(`[name="${fieldName}"]`);
  expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(container).toHaveTextContent(errorText);
};

// ═══════════════════════════════════════════════════════════════════════════════
// RE-EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

// Re-export everything from testing-library for convenience
export * from '@testing-library/react';

// Default export for simple imports
export { renderWithProviders as render };
