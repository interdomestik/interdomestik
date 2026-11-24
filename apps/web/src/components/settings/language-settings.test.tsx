import { updatePreferredLocale } from '@/actions/preferred-locale';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageSettings } from './language-settings';

const replace = vi.fn();

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

// Mock routing
vi.mock('@/actions/preferred-locale', () => ({
  updatePreferredLocale: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/i18n/routing', () => ({
  usePathname: () => '/member/settings',
  useRouter: () => ({
    replace,
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

beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

function languageSelect() {
  return screen.getByRole('combobox', { name: 'Select Language' });
}

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
    expect(languageSelect()).toBeInTheDocument();
  });

  it('renders supported locales in dropdown', async () => {
    const user = userEvent.setup();
    render(<LanguageSettings />);
    await user.click(languageSelect());
    expect(screen.getByRole('option', { name: /Shqip/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Srpski/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Македонски/ })).toBeInTheDocument();
  });

  it('keeps the current locale on a failed save and lets the user retry', async () => {
    vi.mocked(updatePreferredLocale).mockResolvedValueOnce({ success: false, error: 'conflict' });
    const user = userEvent.setup();
    render(<LanguageSettings />);
    const chooseShqip = async () => {
      await user.click(languageSelect());
      await user.click(screen.getByRole('option', { name: /Shqip/ }));
    };

    await chooseShqip();
    expect(updatePreferredLocale).toHaveBeenCalledExactlyOnceWith({ locale: 'sq' });
    expect(toast.error).toHaveBeenCalledWith('localeSaveError');
    expect(replace).not.toHaveBeenCalled();
    expect(languageSelect()).toHaveTextContent('English');

    await chooseShqip();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledExactlyOnceWith('/member/settings', { locale: 'sq' })
    );
  });
});
