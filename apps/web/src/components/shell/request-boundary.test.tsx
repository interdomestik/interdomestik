import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const connection = vi.hoisted(() => vi.fn());
vi.mock('next/server', () => ({ connection }));
import { RequestBoundary, RequestFallback } from './request-boundary';

function runRequest(children: ReactNode) {
  const boundary = RequestBoundary({ children });
  const inner = boundary.props.children;
  const invoke = inner.type as (props: { children: ReactNode }) => Promise<ReactNode>;
  return { boundary, pending: invoke(inner.props) };
}

describe('request boundary', () => {
  it('withholds request children until connection and uses anonymous fallback', async () => {
    let release!: () => void;
    connection.mockReturnValueOnce(
      new Promise<void>(resolve => {
        release = resolve;
      })
    );
    const child = <div data-testid="member-dashboard-ready">private member</div>;
    const { boundary, pending } = runRequest(child);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(boundary.props.fallback.type).toBe(RequestFallback);
    const fallback = renderToStaticMarkup(boundary.props.fallback);
    expect(fallback).toContain('data-testid="request-fallback"');
    expect(fallback).not.toContain('private member');
    expect(fallback).not.toContain('member-dashboard-ready');
    release();
    expect(await pending).toBe(child);
  });

  it('propagates a failed connection without releasing children', async () => {
    connection.mockRejectedValueOnce(new Error('request unavailable'));
    await expect(runRequest('private member').pending).rejects.toThrow('request unavailable');
  });
});
