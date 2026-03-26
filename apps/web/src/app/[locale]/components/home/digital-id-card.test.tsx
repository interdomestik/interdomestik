import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DigitalIDCard } from './digital-id-card';

describe('DigitalIDCard localization', () => {
  it('does not require Albanian fallback labels for mk member card copy', () => {
    render(
      <DigitalIDCard
        name="Stefan Dimitrioski"
        memberNumber="ID-MEMBER"
        validThru="N/A"
        labels={{
          membership: 'Членство',
          claimSupport: 'Отштета',
          legalProtection: 'Правна заштита',
          assistance247: 'Асистенција 24/7',
          memberName: 'Име на член',
          validThru: 'Важи до',
          activeMember: 'Активен член',
          protectionPaused: 'Заштитата е паузирана',
          addToAppleWallet: 'Додај во Apple Wallet',
          googlePayReady: 'Подготвено за Google Pay',
        }}
      />
    );

    expect(screen.queryByText('Dëmshpërblim')).not.toBeInTheDocument();
    expect(screen.queryByText('Mbrojtje Ligjore')).not.toBeInTheDocument();
    expect(screen.queryByText('Asistencë 24/7')).not.toBeInTheDocument();
    expect(screen.queryByText('Member Name')).not.toBeInTheDocument();
    expect(screen.queryByText('Valid Thru')).not.toBeInTheDocument();
    expect(screen.getByText('Отштета')).toBeInTheDocument();
    expect(screen.getByText('Правна заштита')).toBeInTheDocument();
  });
});
