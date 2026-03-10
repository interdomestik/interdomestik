import { describe, expect, it } from 'vitest';

import { buildClaimScopeTreeProps } from './claim-scope-tree-content';

describe('buildClaimScopeTreeProps', () => {
  it('builds the shared claim scope tree content from translation keys', () => {
    const t = (key: string) => `translated:${key}`;

    const props = buildClaimScopeTreeProps(t, 'pricing-scope-tree');

    expect(props.sectionTestId).toBe('pricing-scope-tree');
    expect(props.eyebrow).toBe('translated:scope.eyebrow');
    expect(props.title).toBe('translated:scope.title');
    expect(props.subtitle).toBe('translated:scope.subtitle');
    expect(props.boundaryTitle).toBe('translated:scope.boundary.title');
    expect(props.boundaryBody).toBe('translated:scope.boundary.body');
    expect(props.boundaryItems).toEqual([
      'translated:scope.boundary.items.0',
      'translated:scope.boundary.items.1',
    ]);
    expect(props.groups).toEqual([
      {
        description: 'translated:scope.launch.description',
        items: [
          'translated:scope.launch.items.0',
          'translated:scope.launch.items.1',
          'translated:scope.launch.items.2',
        ],
        note: 'translated:scope.launch.note',
        title: 'translated:scope.launch.title',
        tone: 'launch',
      },
      {
        description: 'translated:scope.guidance.description',
        items: [
          'translated:scope.guidance.items.0',
          'translated:scope.guidance.items.1',
          'translated:scope.guidance.items.2',
          'translated:scope.guidance.items.3',
        ],
        note: 'translated:scope.guidance.note',
        title: 'translated:scope.guidance.title',
        tone: 'guidance',
      },
      {
        description: 'translated:scope.outOfScope.description',
        items: [
          'translated:scope.outOfScope.items.0',
          'translated:scope.outOfScope.items.1',
          'translated:scope.outOfScope.items.2',
          'translated:scope.outOfScope.items.3',
        ],
        note: 'translated:scope.outOfScope.note',
        title: 'translated:scope.outOfScope.title',
        tone: 'outOfScope',
      },
    ]);
  });
});
