import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimDocumentsPane } from './claim-documents-pane';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'details.documents': 'Documents',
      'details.no_documents': 'No documents uploaded',
      'errors.download': 'Failed to download',
    };
    return translations[key] || key;
  },
}));

// Mock date-fns
vi.mock('date-fns', () => ({
  format: () => 'Jan 15, 2024',
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
}));

const mockDocuments = [
  { id: 'doc-1', fileName: 'receipt.pdf', createdAt: '2024-01-15T10:00:00Z' },
  { id: 'doc-2', fileName: 'photo.jpg', createdAt: '2024-01-14T10:00:00Z' },
];

describe('ClaimDocumentsPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders documents title', () => {
    render(<ClaimDocumentsPane documents={mockDocuments} />);
    expect(screen.getByText('Documents')).toBeInTheDocument();
  });

  it('renders document file names', () => {
    render(<ClaimDocumentsPane documents={mockDocuments} />);
    expect(screen.getByText('receipt.pdf')).toBeInTheDocument();
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
  });

  it('renders empty state when no documents', () => {
    render(<ClaimDocumentsPane documents={[]} />);
    expect(screen.getByText('No documents uploaded')).toBeInTheDocument();
  });

  it('renders download buttons for each document', () => {
    render(<ClaimDocumentsPane documents={mockDocuments} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(2);
  });
});
