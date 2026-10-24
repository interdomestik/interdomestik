import type { ReactElement } from 'react';
import { Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/agent/clients/components/AgentClientDetailV2Page', () => ({
  AgentClientDetailV2Page: vi.fn(() => null),
}));

import { AgentClientDetailV2Page } from '@/features/agent/clients/components/AgentClientDetailV2Page';
import AgentMemberProfilePage from './page';

type PageProps = Parameters<typeof AgentMemberProfilePage>[0];
type BoundaryElement = ReactElement<{
  fallback: ReactElement<Record<string, unknown>>;
  children: ReactElement<PageProps, (props: PageProps) => Promise<ReactElement>>;
}>;

function renderBoundary(params: PageProps['params']): BoundaryElement {
  return AgentMemberProfilePage({ params }) as unknown as BoundaryElement;
}

// The async content stays private; it is exercised through the Suspense child.
function renderContent(params: PageProps['params']) {
  const child = renderBoundary(params).props.children;
  return child.type(child.props);
}

describe('AgentMemberProfilePage (clients alias)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a synchronous Suspense boundary with a busy skeleton fallback', () => {
    const params = new Promise<{ locale: string; id: string }>(() => {});
    const boundary = renderBoundary(params);

    expect(boundary.type).toBe(Suspense);
    expect(boundary.props.fallback.type).toBe('output');
    expect(boundary.props.fallback.props['aria-busy']).toBe('true');
    expect(boundary.props.fallback.props['data-testid']).toBe('agent-member-detail-loading');
    expect(boundary.props.children.props.params).toBe(params);
    expect(AgentClientDetailV2Page).not.toHaveBeenCalled();
  });

  it('keeps the shared component unrendered until params resolve', async () => {
    let resolveParams!: (value: { locale: string; id: string }) => void;
    const params = new Promise<{ locale: string; id: string }>(resolve => {
      resolveParams = resolve;
    });

    let settled = false;
    const pending = Promise.resolve(renderContent(params)).then(element => {
      settled = true;
      return element;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(AgentClientDetailV2Page).not.toHaveBeenCalled();

    resolveParams({ locale: 'mk', id: 'member-7' });
    const element = (await pending) as ReactElement<{ id: string; locale: string }>;

    expect(settled).toBe(true);
    expect(element.type).toBe(AgentClientDetailV2Page);
    expect(element.props).toEqual({ id: 'member-7', locale: 'mk' });
  });

  it('maps the id param and locale to the shared component', async () => {
    const element = (await renderContent(
      Promise.resolve({ locale: 'sq', id: 'golden_ks_a_member_1' })
    )) as ReactElement<{ id: string; locale: string }>;

    expect(element.type).toBe(AgentClientDetailV2Page);
    expect(element.props).toEqual({ id: 'golden_ks_a_member_1', locale: 'sq' });
  });

  it('propagates params rejection without inventing a catch', async () => {
    const failure = new Error('params failed');

    await expect(renderContent(Promise.reject(failure))).rejects.toBe(failure);
    expect(AgentClientDetailV2Page).not.toHaveBeenCalled();
  });
});
