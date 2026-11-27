import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MemberSettingsFrame, MemberSettingsUnavailable } from './member-settings-frame';

describe('MemberSettingsFrame', () => {
  it('renders one page heading, then each section labelled by its own heading', () => {
    render(
      <MemberSettingsFrame
        title="Settings"
        description="Manage your account."
        account={[{ id: 'profile', title: 'Profile', content: <input aria-label="Name" /> }]}
        preferences={[{ id: 'language', title: 'Language', content: <p>Language form</p> }]}
        terms={<p>Terms</p>}
      />
    );

    const page = screen.getByTestId('member-settings-page-ready');
    expect(page).toHaveAccessibleName('Settings');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const profile = screen.getByRole('region', { name: 'Profile' });
    expect(profile).toHaveAttribute('id', 'profile');
    expect(within(profile).getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Language' })).toHaveTextContent('Language form');
    expect(page).toHaveTextContent('Terms');
  });
});

describe('MemberSettingsUnavailable', () => {
  it('announces the failure and retries with a native link that reloads the page', () => {
    render(
      <MemberSettingsUnavailable
        href="/de/member/settings"
        message="Could not load"
        retryLabel="Try again"
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load');
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute(
      'href',
      '/de/member/settings'
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
