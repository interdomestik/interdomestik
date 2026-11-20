import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentList } from './document-list';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'actions.view': 'View',
      'actions.download': 'Download',
      emptyList: 'No documents attached.',
    };
    return translations[key] ?? key;
  },
}));

const documents = [
  { id: 'doc-1', name: 'police-report.pdf', fileSize: 2048, fileType: 'application/pdf' },
];

describe('DocumentList', () => {
  it('names the icon-only view and download actions and ties them to the file', () => {
    render(<DocumentList documents={documents} />);

    const view = screen.getByRole('button', { name: 'View' });
    const download = screen.getByRole('button', { name: 'Download' });
    expect(view).toHaveAccessibleDescription('police-report.pdf');
    expect(download).toHaveAccessibleDescription('police-report.pdf');
  });

  it('keeps 44px phone targets and the compact desktop height', () => {
    render(<DocumentList documents={documents} />);

    for (const name of ['View', 'Download']) {
      expect(screen.getByRole('button', { name })).toHaveClass(
        'min-h-11',
        'min-w-11',
        'sm:min-h-9',
        'sm:min-w-0'
      );
    }
  });
});
