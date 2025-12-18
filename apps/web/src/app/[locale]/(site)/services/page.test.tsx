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

    // Solutions
    expect(screen.getByText('solutions.title')).toBeInTheDocument();
    expect(screen.getByText('solutions.vehicle.title')).toBeInTheDocument();
    expect(screen.getByText('solutions.property.title')).toBeInTheDocument();

    // Process
    expect(screen.getByText('process.title')).toBeInTheDocument();
    expect(screen.getByText('process.step1.title')).toBeInTheDocument();

    // Safety
    expect(screen.getByText('safety.title')).toBeInTheDocument();
    expect(screen.getByText('safety.speed.title')).toBeInTheDocument();

    // FAQ
    expect(screen.getByText('faq.title')).toBeInTheDocument();
  });
});
