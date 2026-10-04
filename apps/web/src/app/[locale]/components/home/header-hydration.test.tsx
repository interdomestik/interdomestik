import { useSyncExternalStore } from 'react';
import { act } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import enNavMessages from '@/messages/en/nav.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { Header } from './header';

const h = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock('@/lib/auth-client', () => ({ authClient: { useSession: h.useSession } }));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: createUseTranslationsMock(() => enNavMessages),
}));
vi.mock('@/i18n/routing', () => ({
  Link: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));
function signedInAs(role: string) {
  return { user: { id: 'user-1', role } };
}

describe('server/hydration session timing', () => {
  // Mirrors better-auth's react bridge: `useSyncExternalStore(subscribe, get, get)`
  // shares one getter for both the client and "server" snapshot, so whatever the
  // store currently holds at call time is what hydration sees too. A sibling (e.g.
  // HomePageRuntime) resolving the shared session store between the server render
  // and Header's own hydration pass is exactly what must not desync the markup.
  function createSessionStore(initial: { data: unknown; isPending: boolean }) {
    let value = initial;
    const listeners = new Set<() => void>();
    return {
      set(next: { data: unknown; isPending: boolean }) {
        value = next;
        listeners.forEach(listener => listener());
      },
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => value,
    };
  }

  function hydrationScenario(resolved: { data: unknown; isPending: boolean }) {
    const store = createSessionStore({ data: null, isPending: true });
    h.useSession.mockImplementation(() =>
      useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    );

    const html = renderToString(<Header />);

    // The sibling resolves the shared store before Header's hydration render runs.
    store.set(resolved);

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    return container;
  }

  async function hydrate(container: HTMLElement) {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let recoverableError: unknown;
    let root: Root | undefined;
    let consoleErrors: unknown[][] = [];
    try {
      await act(async () => {
        root = hydrateRoot(container, <Header />, {
          onRecoverableError: error => {
            recoverableError = error;
          },
        });
      });
    } catch (error) {
      await act(async () => root?.unmount());
      throw error;
    } finally {
      consoleErrors = [...consoleError.mock.calls];
      consoleError.mockRestore();
    }
    return { root, consoleErrors, recoverableError };
  }

  it('keeps MyAccount stable through hydration when a sibling resolves the session store first', async () => {
    const container = hydrationScenario({ data: signedInAs('member'), isPending: false });

    let root: Root | undefined;
    try {
      const result = await hydrate(container);
      root = result.root;
      const { consoleErrors, recoverableError } = result;

      expect(recoverableError).toBeUndefined();
      expect(consoleErrors).toEqual([]);
      expect(container.querySelector('[data-testid="public-auth-action"]')).toHaveAttribute(
        'href',
        '/en/member'
      );
      expect(container.querySelector('[data-testid="public-auth-action"]')).toHaveTextContent(
        enNavMessages.nav.myAccount
      );
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it('keeps the login door stable through hydration when a sibling resolves a signed-out session first', async () => {
    const container = hydrationScenario({ data: null, isPending: false });

    let root: Root | undefined;
    try {
      const result = await hydrate(container);
      root = result.root;
      const { consoleErrors, recoverableError } = result;

      expect(recoverableError).toBeUndefined();
      expect(consoleErrors).toEqual([]);
      expect(container.querySelector('[data-testid="public-auth-action"]')).toHaveAttribute(
        'href',
        '/en/login'
      );
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });
});
