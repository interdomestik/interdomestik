import { SidebarProvider, useSidebar } from '@interdomestik/ui';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useEffect, useState, type RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PendingSheetOpener } from './mobile-sheet-focus';
import { OpsDrawer } from '@/components/ops/OpsDrawer';
import { RoleShellMobileNavigation } from './role-shell-mobile-navigation';

vi.mock('@interdomestik/ui/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('@/i18n/routing', () => ({ Link: 'a' }));

function ControlledNavigation({
  open,
  pendingOpener,
}: Readonly<{ open: boolean; pendingOpener: RefObject<PendingSheetOpener | null> }>) {
  const { setOpenMobile } = useSidebar();
  useEffect(() => setOpenMobile(open), [open, setOpenMobile]);
  return (
    <RoleShellMobileNavigation
      items={[]}
      primaryItems={[]}
      pathname="/workspace"
      labels={{ navigation: 'Navigation', more: 'More', close: 'Cancel' }}
      account={<button>Account</button>}
      mode="bottom"
      pendingOpener={pendingOpener}
    />
  );
}

function setup(blockTrigger = false) {
  const pendingOpener = createRef<PendingSheetOpener | null>();
  const view = (open: boolean) => (
    <SidebarProvider>
      <div data-testid="search-owner">
        <button>Search</button>
      </div>
      <div
        onClickCapture={event => {
          if (blockTrigger) event.preventDefault();
        }}
      >
        <ControlledNavigation open={open} pendingOpener={pendingOpener} />
      </div>
    </SidebarProvider>
  );
  const { rerender } = render(view(false));
  return { open: () => rerender(view(true)), pendingOpener };
}

async function closeNavigation() {
  const dialog = await screen.findByRole('dialog', { name: 'More' });
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
  await userEvent.setup().keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

describe('mobile sheet focus lifecycle', () => {
  it('returns to the current control after programmatic opening without a trigger', async () => {
    const { open } = setup();
    const search = screen.getByRole('button', { name: 'Search' });
    search.focus();
    open();
    await closeNavigation();
    await waitFor(() => expect(search).toHaveFocus());
  });

  it('expires an opener when a prevented click does not open the sheet', async () => {
    const { open, pendingOpener } = setup(true);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(pendingOpener.current).toBeNull());
    const search = screen.getByRole('button', { name: 'Search' });
    search.focus();
    open();
    await closeNavigation();
    await waitFor(() => expect(search).toHaveFocus());
  });

  it.each([
    ['hidden', 'hidden', ''],
    ['aria-hidden', 'aria-hidden', 'true'],
    ['inert', 'inert', ''],
    ['display:none', 'style', 'display: none'],
    ['visibility:hidden', 'style', 'visibility: hidden'],
  ])('leaves restoration to Radix for a target inside a %s ancestor', async (_name, key, value) => {
    const { open } = setup();
    const search = screen.getByRole('button', { name: 'Search' });
    const more = screen.getByRole('button', { name: 'More' });
    search.focus();
    open();
    await screen.findByRole('dialog');
    screen.getByTestId('search-owner').setAttribute(key, value);
    await closeNavigation();
    await waitFor(() => expect(more).toHaveFocus());
  });
});

function CaseDrawer({ inline }: Readonly<{ inline: boolean }>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open case</button>
      <OpsDrawer
        open={open}
        onOpenChange={setOpen}
        inlineOnMobile={inline}
        title="Case"
        closeLabel="Back to list"
        descriptionText="Case details"
      >
        <button>Existing action</button>
      </OpsDrawer>
    </>
  );
}

describe('OpsDrawer focus return', () => {
  it.each([true, false])(
    'returns to the opener after Escape and close (inline=%s)',
    async inline => {
      const user = userEvent.setup();
      render(<CaseDrawer inline={inline} />);
      const opener = screen.getByRole('button', { name: 'Open case' });
      for (const closeByButton of [false, true]) {
        await user.click(opener);
        const surface = await screen.findByTestId('ops-drawer');
        if (inline) await waitFor(() => expect(surface).toHaveFocus());
        if (closeByButton) {
          await user.click(within(surface).getByRole('button', { name: 'Back to list' }));
        } else {
          await user.keyboard('{Escape}');
        }
        await waitFor(() => expect(screen.queryByTestId('ops-drawer')).not.toBeInTheDocument());
        await waitFor(() => expect(opener).toHaveFocus());
      }
    }
  );

  it('does not restore focus to an opener hidden while the stack is open', async () => {
    const user = userEvent.setup();
    render(<CaseDrawer inline />);
    const opener = screen.getByRole('button', { name: 'Open case' });
    await user.click(opener);
    opener.hidden = true;
    await user.click(screen.getByRole('button', { name: 'Back to list' }));
    expect(opener).not.toHaveFocus();
  });
});
