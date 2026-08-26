import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), '../../packages/ui/src');
const names = [
  'components/crystal/tokens.ts',
  'components/crystal/matte-anchor-card.tsx',
  'components/crystal/refractive-glass-panel.tsx',
  'components/crystal/stepper.tsx',
  'components/crystal/timeline.tsx',
  'components/crystal/index.ts',
  'components/crystal/crystal.stories.tsx',
  'index.ts',
];
const source = (name: string) => readFileSync(join(root, name), 'utf8');

describe('Crystal boundaries', () => {
  it('keeps production cohesive and free of domain or motion runtime imports', () => {
    for (const name of names.slice(0, 6)) {
      const text = source(name);
      expect(text.split('\n').length - 1).toBeLessThanOrEqual(150);
      expect(text).not.toMatch(
        /@interdomestik\/(?:database|domain-|shared-auth)|framer-motion|@\/|next\//u
      );
    }
  });

  it('bounds glass filters and representative story layers', () => {
    expect(source(names[2]).match(/backdrop-(?:filter|blur)/gu)).toHaveLength(1);
    expect(source(names[6]).match(/<RefractiveGlassPanel/gu)?.length ?? 0).toBeLessThanOrEqual(2);
    expect(source(names[6])).toContain('320 / 768 / 1440');
  });
});
