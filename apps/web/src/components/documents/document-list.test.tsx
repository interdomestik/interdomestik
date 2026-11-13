import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentList } from './document-list';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'actions.view': 'View',
      'actions.download': 'Download',
      emptyList: 'No documents attached.',
      pdf: 'PDF',
      word: 'Word',
      email: 'Email',
      audio: 'Audio',
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

  it('shows a readable file type instead of the raw MIME type (qa3 #68)', () => {
    render(
      <DocumentList
        documents={[
          ...documents,
          {
            id: 'doc-2',
            name: 'contract.docx',
            fileSize: 4096,
            fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
          { id: 'doc-3', name: 'thread.eml', fileSize: 577, fileType: 'message/rfc822' },
          { id: 'doc-4', name: 'call.m4a', fileSize: 900, fileType: 'audio/mp4' },
        ]}
      />
    );

    expect(screen.getByText('2.0 KB · PDF')).toBeInTheDocument();
    expect(screen.getByText('4.0 KB · Word')).toBeInTheDocument();
    expect(screen.getByText('577 B · Email')).toBeInTheDocument();
    expect(screen.getByText('900 B · Audio')).toBeInTheDocument();
    expect(screen.queryByText(/application\/|message\/rfc822|audio\/mp4/)).not.toBeInTheDocument();
  });
});
