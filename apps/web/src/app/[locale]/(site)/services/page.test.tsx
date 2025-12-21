import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ServicesPage from './page';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

describe('ServicesPage', () => {
  it('renders all sections correctly', async () => {
    const ui = await ServicesPage({ params: Promise.resolve({ locale: 'en' }) });
    render(ui);

    // Hero
    expect(screen.getByText('hero.title')).toBeInTheDocument();
    expect(screen.getByText('hero.subtitle')).toBeInTheDocument();

    // Consultation
    expect(screen.getByText('categories.consultation.title')).toBeInTheDocument();
    expect(screen.getByText('categories.consultation.subtitle')).toBeInTheDocument();

    // Expertise
    expect(screen.getByText('categories.expertise.title')).toBeInTheDocument();
    expect(screen.getByText('categories.expertise.subtitle')).toBeInTheDocument();

    // Legal
    expect(screen.getByText('categories.legal.title')).toBeInTheDocument();
    expect(screen.getByText('categories.legal.subtitle')).toBeInTheDocument();

    // Experts
    expect(screen.getByText('experts.title')).toBeInTheDocument();
  });
});
