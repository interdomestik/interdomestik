import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const connection = vi.hoisted(() => vi.fn());
vi.mock('next/server', () => ({ connection }));
import { RequestBoundary, RequestFallback } from './request-boundary';

function runRequest(render: () => ReactNode) {
  const boundary = RequestBoundary({ render });
  const inner = boundary.props.children;
  const invoke = inner.type as (props: { render: () => ReactNode }) => Promise<ReactNode>;
  return { boundary, pending: invoke(inner.props) };
}

describe('request boundary', () => {
  it('keeps private children out of its fallback', async () => {
    let release!: () => void;
    connection.mockReturnValueOnce(
      new Promise<void>(resolve => {
        release = resolve;
      })
    );
    const child = <div data-testid="member-dashboard-ready">private member</div>;
    const render = vi.fn(() => child);
    const { boundary, pending } = runRequest(render);
    expect(render).not.toHaveBeenCalled();
    expect(boundary.props.fallback.type).toBe(RequestFallback);
    const fallback = renderToStaticMarkup(boundary.props.fallback);
    expect(fallback).toContain('<output class="sr-only">Loading</output>');
    expect(fallback).not.toContain('member-dashboard-ready');
    release();
    expect(await pending).toBe(child);
    expect(render).toHaveBeenCalledOnce();
  });

  it('propagates a failed connection without releasing children', async () => {
    connection.mockRejectedValueOnce(new Error('request unavailable'));
    const render = vi.fn(() => 'private member');
    await expect(runRequest(render).pending).rejects.toThrow('request unavailable');
    expect(render).not.toHaveBeenCalled();
  });
});
