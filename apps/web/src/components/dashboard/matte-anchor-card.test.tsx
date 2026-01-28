import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MatteAnchorCard } from './matte-anchor-card';

// Mock routing
vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe('MatteAnchorCard', () => {
  it('renders the label and description', () => {
    render(
      <MatteAnchorCard
        label="Test Label"
        description="Test Desc"
        iconName="incident"
        href="/test"
      />
    );
    expect(screen.getByText('Test Label')).toBeInTheDocument();
    expect(screen.getByText('Test Desc')).toBeInTheDocument();
  });
});
