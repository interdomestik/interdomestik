import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { UnifiedPortalShell } from '@interdomestik/ui';
import { describe, expect, it } from 'vitest';

const shellSource = () =>
  readFileSync(
    join(process.cwd(), '../../packages/ui/src/components/crystal/unified-portal-shell.tsx'),
    'utf8'
  );

describe('UnifiedPortalShell', () => {
  it('keeps named regions in logical order', () => {
    render(
      <UnifiedPortalShell
        caseLabel="Case"
        caseRegion={<button type="button">Open case</button>}
        actionsLabel="Actions"
        actionsRegion={<a href="#continue">Continue</a>}
        timelineLabel="Timeline"
        timelineRegion={<p>Case opened</p>}
      />
    );

    const regions = screen.getAllByRole('region');
    expect(regions.map(region => region.getAttribute('aria-label'))).toEqual([
      'Case',
      'Actions',
      'Timeline',
    ]);
    expect(regions[0]).toContainElement(screen.getByRole('button', { name: 'Open case' }));
    expect(regions[1]).toContainElement(screen.getByRole('link', { name: 'Continue' }));
    expect(regions[2]).toHaveTextContent('Case opened');
  });

  it('keeps caller-owned states and pure boundaries', () => {
    render(
      <UnifiedPortalShell
        caseLabel="Case"
        caseRegion={<p role="status">No case selected</p>}
        actionsLabel="Actions"
        actionsRegion={<p role="alert">Actions unavailable</p>}
        timelineLabel="Timeline"
        timelineRegion={<p>No activity yet</p>}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('No case selected');
    expect(screen.getByRole('alert')).toHaveTextContent('Actions unavailable');
    expect(screen.getByText('No activity yet')).toBeInTheDocument();

    const source = shellSource();
    expect(source.split('\n').length - 1).toBeLessThanOrEqual(150);
    expect(source).not.toMatch(
      /@interdomestik\/(?:database|domain-|shared-auth)|framer-motion|@\/|next\//u
    );
    expect(source).not.toMatch(/backdrop-(?:filter|blur)|useEffect|useState|muted-700/u);
  });
});
