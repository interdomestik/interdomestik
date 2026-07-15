import { cleanup, render, screen } from '@testing-library/react';
import { freeStartLocaleMessages as messages } from '@/messages/free-start-test-messages';
import { createUseTranslationsMock } from '@/test/next-intl-mock';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createClaimPack, type ResultLocale } from './claim-pack-result.test-fixtures';

const hoisted = vi.hoisted(() => ({ locale: 'sq' as ResultLocale }));

vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => messages[hoisted.locale]),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { ClaimPackResult } from './claim-pack-result';

afterEach(cleanup);

const localeHeadings = [
  ['en', 'Your temporary result is ready.'],
  ['sq', 'Përmbledhja juaj e përkohshme është gati.'],
  ['sr', 'Vaš privremeni rezultat je spreman.'],
  ['mk', 'Вашиот привремен резултат е подготвен.'],
] as const;

describe('ClaimPackResult localization', () => {
  it.each(localeHeadings)(
    'renders a complete %s result without raw domain prose',
    (locale, heading) => {
      hoisted.locale = locale;
      const pack = createClaimPack(locale);
      const { container } = render(
        <ClaimPackResult ctaHref="/member/claims/new" ctaLabel="Continue" pack={pack} />
      );

      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
      expect(screen.getByTestId('claim-pack-result').tagName).toBe('ARTICLE');
      expect(container).not.toHaveTextContent('Good potential — complete your evidence');
      expect(container).not.toHaveTextContent('human triage');
      expect(screen.getByTestId('claim-pack-result')).toHaveTextContent(`${pack.confidence.score}`);
    }
  );

  it.each([
    ['vehicle', 'Fotografi të dëmit në automjet'],
    ['property', 'Fotografi të dëmit në pronë'],
    ['injury', 'Dokumentet mjekësore'],
  ] as const)('localizes every %s evidence and timeline item in Albanian', (claimType, item) => {
    hoisted.locale = 'sq';
    const { container } = render(
      <ClaimPackResult
        ctaHref="/pricing"
        ctaLabel="Vazhdoni"
        pack={createClaimPack('sq', claimType)}
      />
    );

    expect(screen.getByTestId('claim-pack-evidence')).toHaveTextContent(item);
    expect(container.textContent).not.toMatch(
      /Damage photographs|Expected resolution|triage|intake/i
    );
  });

  it('fails safely for future evidence and timeline identifiers', () => {
    hoisted.locale = 'sq';
    const pack = createClaimPack('sq');
    pack.evidenceChecklist.items[0] = {
      ...pack.evidenceChecklist.items[0],
      id: 'future_evidence',
      name: 'RAW FUTURE EVIDENCE',
      description: 'RAW FUTURE EVIDENCE DESCRIPTION',
    };
    pack.timeline.milestones[0] = {
      ...pack.timeline.milestones[0],
      id: 'future_timeline',
      label: 'RAW FUTURE TIMELINE',
      estimatedRange: 'RAW FUTURE RANGE',
      description: 'RAW FUTURE TIMELINE DESCRIPTION',
    };

    const { container } = render(
      <ClaimPackResult ctaHref="/pricing" ctaLabel="Vazhdoni" pack={pack} />
    );

    expect(container).toHaveTextContent('Dokument mbështetës');
    expect(container).toHaveTextContent('Hap planifikimi');
    expect(container.textContent).not.toMatch(/RAW FUTURE/);
  });
});
