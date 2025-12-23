import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageSettings } from './language-settings';

// Mock routing
vi.mock('@/i18n/routing', () => ({
  usePathname: () => '/member/settings',
  useRouter: () => ({
    replace: vi.fn(),
  }),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'language.title': 'Language',
      'language.description': 'Choose your preferred language',
      'language.selectLabel': 'Select Language',
      'language.selectPlaceholder': 'Select a language',
      'language.hint': 'The interface will update immediately',
    };
    return translations[key] || key;
  },
}));

// Mock UI components
vi.mock('@interdomestik/ui/components/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@interdomestik/ui/components/label', () => ({
  Label: ({
    children,
    ...props
  }: React.LabelHTMLAttributes<HTMLLabelElement> & { children: React.ReactNode }) => (
    <label {...props}>{children}</label>
  ),
}));

vi.mock('@interdomestik/ui/components/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="select">{children}</div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
}));

describe('LanguageSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the language settings title', () => {
    render(<LanguageSettings />);
    expect(screen.getByText('Language')).toBeInTheDocument();
  });

  it('renders the description', () => {
    render(<LanguageSettings />);
    expect(screen.getByText('Choose your preferred language')).toBeInTheDocument();
  });

  it('renders the select label', () => {
    render(<LanguageSettings />);
    expect(screen.getByText('Select Language')).toBeInTheDocument();
  });

  it('renders hint text', () => {
    render(<LanguageSettings />);
    expect(screen.getByText('The interface will update immediately')).toBeInTheDocument();
  });

  it('renders select component', () => {
    render(<LanguageSettings />);
    expect(screen.getByTestId('select')).toBeInTheDocument();
  });

  it('renders supported locales in dropdown', () => {
    render(<LanguageSettings />);
    // Check that locale labels are rendered
    expect(screen.getByText('Shqip')).toBeInTheDocument();
    expect(screen.getByText('Srpski')).toBeInTheDocument();
    expect(screen.getByText('Македонски')).toBeInTheDocument();
  });
});
