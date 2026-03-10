import type { ClaimScopeTreeProps } from './claim-scope-tree';

type ClaimScopeTranslator = (key: string) => string;

export function buildClaimScopeTreeProps(
  t: ClaimScopeTranslator,
  sectionTestId: NonNullable<ClaimScopeTreeProps['sectionTestId']>
): ClaimScopeTreeProps {
  return {
    boundaryBody: t('scope.boundary.body'),
    boundaryItems: [t('scope.boundary.items.0'), t('scope.boundary.items.1')],
    boundaryTitle: t('scope.boundary.title'),
    eyebrow: t('scope.eyebrow'),
    groups: [
      {
        description: t('scope.launch.description'),
        items: [t('scope.launch.items.0'), t('scope.launch.items.1'), t('scope.launch.items.2')],
        note: t('scope.launch.note'),
        title: t('scope.launch.title'),
        tone: 'launch',
      },
      {
        description: t('scope.guidance.description'),
        items: [
          t('scope.guidance.items.0'),
          t('scope.guidance.items.1'),
          t('scope.guidance.items.2'),
          t('scope.guidance.items.3'),
        ],
        note: t('scope.guidance.note'),
        title: t('scope.guidance.title'),
        tone: 'guidance',
      },
      {
        description: t('scope.outOfScope.description'),
        items: [
          t('scope.outOfScope.items.0'),
          t('scope.outOfScope.items.1'),
          t('scope.outOfScope.items.2'),
          t('scope.outOfScope.items.3'),
        ],
        note: t('scope.outOfScope.note'),
        title: t('scope.outOfScope.title'),
        tone: 'outOfScope',
      },
    ],
    sectionTestId,
    subtitle: t('scope.subtitle'),
    title: t('scope.title'),
  };
}
