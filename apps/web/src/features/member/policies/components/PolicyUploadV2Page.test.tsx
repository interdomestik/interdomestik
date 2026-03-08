import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PolicyUploadV2Page } from './PolicyUploadV2Page';

const hoisted = vi.hoisted(() => ({
  fetch: vi.fn(),
  refresh: vi.fn(),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({
    refresh: hoisted.refresh,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('sonner', () => ({
  toast: hoisted.toast,
}));

vi.mock('@interdomestik/ui', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardDescription: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p {...props}>{children}</p>
  ),
  CardHeader: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props}>{children}</h2>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
}));

describe('PolicyUploadV2Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hoisted.fetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('polls the queued run and renders the needs-review state', async () => {
    hoisted.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          runId: 'run-1',
          status: 'queued',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'run-1',
          status: 'processing',
          workflowState: 'processing',
          reviewStatus: 'pending',
          warnings: [],
          extraction: null,
          createdAt: '2026-03-08T12:00:00.000Z',
          startedAt: '2026-03-08T12:01:00.000Z',
          completedAt: null,
          errorCode: null,
          errorMessage: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'run-1',
          status: 'completed',
          workflowState: 'needs_review',
          reviewStatus: 'pending',
          warnings: ['Confirm deductible'],
          extraction: {
            provider: 'Carrier Co',
          },
          createdAt: '2026-03-08T12:00:00.000Z',
          startedAt: '2026-03-08T12:01:00.000Z',
          completedAt: '2026-03-08T12:02:00.000Z',
          errorCode: null,
          errorMessage: null,
        }),
      });

    render(<PolicyUploadV2Page />);

    const fileInput = screen.getByLabelText('Policy File');
    fireEvent.change(fileInput, {
      target: {
        files: [new File(['policy'], 'policy.pdf', { type: 'application/pdf' })],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze Policy' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(hoisted.fetch).toHaveBeenNthCalledWith(2, '/api/ai/runs/run-1', expect.any(Object));

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(hoisted.fetch).toHaveBeenNthCalledWith(3, '/api/ai/runs/run-1', expect.any(Object));
    expect(screen.getByText('Needs Review')).toBeInTheDocument();
    expect(screen.getByText('Confirm deductible')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(6000);
    });

    expect(hoisted.fetch).toHaveBeenCalledTimes(3);
  });
});
