import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CSVUploader } from './csv-uploader';

const mockUseActionState = vi.hoisted(() => vi.fn());

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();

  return {
    ...actual,
    useActionState: mockUseActionState,
  };
});

vi.mock('@/lib/actions/agent', () => ({
  importMembers: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

class MockFileReader {
  onload: ((event: { target: { result: string } }) => void) | null = null;

  readAsText() {
    this.onload?.({
      target: {
        result: [
          'fullName,email,phone,password,planId',
          'Jane Doe,jane@example.com,+38344111222,Secret123!,',
        ].join('\n'),
      },
    });
  }
}

describe('CSVUploader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseActionState.mockReturnValue([
      {
        error: '',
        summary: { total: 1, imported: 1, failed: 0 },
        results: [{ index: 0, email: 'jane@example.com', fullName: 'Jane Doe', ok: true }],
      },
      vi.fn(),
      false,
    ]);
    vi.stubGlobal('FileReader', MockFileReader);
  });

  it('serializes parsed rows for the bulk import action and renders the import summary', async () => {
    const { container } = render(<CSVUploader />);

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [new File(['csv'], 'members.csv', { type: 'text/csv' })],
      },
    });

    await waitFor(() => {
      const rowsJsonInput = container.querySelector('input[name="rowsJson"]') as HTMLInputElement;
      expect(rowsJsonInput).not.toBeNull();
      expect(rowsJsonInput.value).toContain('"planId":"standard"');
      expect(screen.getByText('Imported 1 of 1 members')).toBeInTheDocument();
    });
  });
});
