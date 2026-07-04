import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpNowExperience } from './help-now-experience';

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

describe('HelpNowExperience', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders public no-account controls and dark country-pack status', () => {
    render(<HelpNowExperience locale="en" />);

    expect(screen.getByTestId('help-now-page-ready')).toHaveAttribute(
      'data-scope',
      'public-no-account'
    );
    expect(screen.getAllByText('Country pack awaiting L2 sign-off')).toHaveLength(2);
    expect(screen.getByText('Signed packs: 0')).toBeInTheDocument();
    expect(screen.queryByText(/112|192/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('help-now-generate-pack')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Flight: coming soon' })).toBeDisabled();
    expect(screen.getByText(/nothing sent/i)).toBeInTheDocument();
  });

  it('keeps scenario and country explicit for local pack context', async () => {
    const user = userEvent.setup();
    render(<HelpNowExperience locale="de" />);

    expect(screen.getByLabelText('Trip country')).toHaveValue('DE');
    await user.click(screen.getByRole('button', { name: 'Sachschaden' }));
    expect(screen.getByRole('button', { name: 'Sachschaden' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    expect(screen.queryByText('Zone')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps evidence local and allows clearing the bundle', async () => {
    const user = userEvent.setup();
    render(<HelpNowExperience locale="en" />);

    const file = new File(['local'], 'scene.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByTestId('help-now-shot-0'), file);

    expect(screen.getByText(/scene.jpg/)).toBeInTheDocument();
    expect(localStorage.getItem('interdomestik.helpNow.evidenceBundle.v1')).toContain('scene.jpg');

    await user.click(screen.getByTestId('help-now-clear-bundle'));
    expect(localStorage.getItem('interdomestik.helpNow.evidenceBundle.v1')).toBeNull();
  });
});
