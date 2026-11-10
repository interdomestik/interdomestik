import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OpsDrawer } from './OpsDrawer';

const viewport = vi.hoisted(() => ({ mobile: true }));
vi.mock('@interdomestik/ui/hooks/use-mobile', () => ({ useIsMobile: () => viewport.mobile }));

function Draft() {
  const [value, setValue] = useState('');
  return <textarea aria-label="Draft" value={value} onChange={e => setValue(e.target.value)} />;
}

describe('OpsDrawer', () => {
  it('keeps an open inline drawer and its draft across a breakpoint change, closing on Escape', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const drawer = () => (
      <OpsDrawer open inlineOnMobile title="Case" closeLabel="Close" onOpenChange={onOpenChange}>
        <Draft />
      </OpsDrawer>
    );
    viewport.mobile = true;
    const { rerender } = render(drawer());
    await user.type(screen.getByRole('textbox', { name: 'Draft' }), 'unsent reply');
    viewport.mobile = false;
    rerender(drawer());
    expect(screen.getByRole('region', { name: 'Case' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('unsent reply');
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
