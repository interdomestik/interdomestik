import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RightsContent } from './rights-content';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Your Consumer Rights',
      intro: 'Know your rights under the Law on Consumer Protection',
      'rights.safety.title': 'Right to Safety',
      'rights.safety.description':
        'Protection against products and services that are hazardous to life and health.',
      'rights.information.title': 'Right to Information',
      'rights.information.description': 'Access to clear, accurate, and truthful information.',
      'rights.redress.title': 'Right to Redress',
      'rights.redress.description': 'Compensation for faulty goods.',
      'rights.representation.title': 'Right to Representation',
      'rights.representation.description': 'The right to form and join consumer associations.',
      'rights.choice.title': 'Right to Choice',
      'rights.choice.description': 'The ability to choose from a range of products.',
      'rights.education.title': 'Right to Education',
      'rights.education.description': 'Access to programs and information.',
      cta: 'Start a Claim',
    };
    return translations[key] || key;
  },
}));

// Mock routing
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('RightsContent', () => {
  it('renders the rights content correctly', () => {
    render(<RightsContent />);

    expect(screen.getByText('Your Consumer Rights')).toBeInTheDocument();
    expect(
      screen.getByText('Know your rights under the Law on Consumer Protection')
    ).toBeInTheDocument();
    expect(screen.getByText('Right to Safety')).toBeInTheDocument();
    expect(screen.getByText('Right to Information')).toBeInTheDocument();
    expect(screen.getAllByText('Start a Claim')).toHaveLength(2); // Title and Button
  });
});
