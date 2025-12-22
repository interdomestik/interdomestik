import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WizardStepEvidence } from './wizard-step-evidence';

// Mock supabase
vi.mock('@interdomestik/database/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        uploadToSignedUrl: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  }),
}));

// Mock react-hook-form
vi.mock('react-hook-form', () => ({
  useFormContext: () => ({
    control: {},
    watch: vi.fn((key: string) => {
      if (key === 'files') return [];
      if (key === 'category') return 'travel';
      return undefined;
    }),
    setValue: vi.fn(),
    getValues: vi.fn().mockReturnValue([]),
  }),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => {
    const fn = (key: string) => {
      const translations: Record<string, string | string[]> = {
        title: 'Upload Evidence',
        subtitle: 'Attach supporting documents',
        tooltip: 'Upload photos, receipts, or documents',
        promptTitle: 'What to upload',
        promptDescription: 'Consider uploading:',
        'upload.cta': 'Click to upload',
        'upload.sub': 'or drag and drop',
        'upload.secure': 'Files are encrypted',
        'emptyWarning.title': 'No files attached',
        'emptyWarning.body': 'Claims with evidence are processed faster',
        'validation.mime': 'Invalid file type',
        'validation.size': 'File too large',
        'validation.prepare': 'Failed to prepare upload',
        'validation.upload': 'Upload failed',
      };
      return translations[key] || key;
    };
    fn.raw = () => ({
      prompts: {
        travel: ['Boarding pass', 'Delay notice', 'Receipts'],
        default: ['Photos', 'Receipts', 'Documents'],
      },
    });
    return fn;
  },
}));

// Mock UI components
vi.mock('@interdomestik/ui/components/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@interdomestik/ui/components/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@interdomestik/ui/components/card', () => ({
  Card: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) => (
    <div {...props}>{children}</div>
  ),
}));

vi.mock('@interdomestik/ui/components/form', () => ({
  FormField: () => null,
  FormItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormLabel: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
  FormMessage: () => null,
}));

vi.mock('@interdomestik/ui/components/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('WizardStepEvidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the evidence upload title', () => {
    render(<WizardStepEvidence />);
    expect(screen.getByText('Upload Evidence')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<WizardStepEvidence />);
    expect(screen.getByText('Attach supporting documents')).toBeInTheDocument();
  });

  it('shows upload call to action', () => {
    render(<WizardStepEvidence />);
    expect(screen.getByText('Click to upload')).toBeInTheDocument();
    expect(screen.getByText('or drag and drop')).toBeInTheDocument();
  });

  it('shows empty warning when no files', () => {
    render(<WizardStepEvidence />);
    expect(screen.getByText('No files attached')).toBeInTheDocument();
    expect(screen.getByText('Claims with evidence are processed faster')).toBeInTheDocument();
  });

  it('shows security badge', () => {
    render(<WizardStepEvidence />);
    expect(screen.getByText('Files are encrypted')).toBeInTheDocument();
  });

  it('shows prompt list for category', () => {
    render(<WizardStepEvidence />);
    expect(screen.getByText('What to upload')).toBeInTheDocument();
  });
});
