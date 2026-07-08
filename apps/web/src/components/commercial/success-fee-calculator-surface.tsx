import type { EntityDisclosureNoticeLabels } from './entity-disclosure-notice';
import type { EntityDisclosureNoticeModel } from './entity-disclosure-notice';
import { SuccessFeeCalculator } from './success-fee-calculator';
import { buildSuccessFeeCalculatorProps } from './success-fee-calculator-props';

type SuccessFeeCalculatorSurfaceProps = Readonly<{
  entity?: EntityDisclosureNoticeModel | null;
  locale: string;
  registerEntry?: boolean;
  surface: 'home' | 'pricing';
  t: (key: string) => string;
}>;

const SURFACE_TEST_IDS: Record<SuccessFeeCalculatorSurfaceProps['surface'], string> = {
  home: 'home-pricing-success-fee-calculator',
  pricing: 'pricing-success-fee-calculator',
};

const ENTITY_LABELS: Record<string, EntityDisclosureNoticeLabels> = {
  en: {
    title: 'Contracting entity',
    contractingCompany: 'Contracting company',
    governingLaw: 'Governing law',
    unavailableTitle: 'Contracting entity unavailable',
    unavailableBody:
      'We cannot show the contracting company and governing law right now. Please contact support before continuing.',
  },
  sq: {
    title: 'Subjekti kontraktues',
    contractingCompany: 'Kompania kontraktuese',
    governingLaw: 'Ligji i zbatueshëm',
    unavailableTitle: 'Subjekti kontraktues nuk është i disponueshëm',
    unavailableBody:
      'Nuk mund ta shfaqim kompaninë kontraktuese dhe ligjin e zbatueshëm tani. Kontaktoni mbështetjen para se të vazhdoni.',
  },
  mk: {
    title: 'Договорен субјект',
    contractingCompany: 'Договорна компанија',
    governingLaw: 'Применливо право',
    unavailableTitle: 'Договорниот субјект не е достапен',
    unavailableBody:
      'Во моментов не можеме да ја прикажеме договорната компанија и применливото право. Контактирајте поддршка пред да продолжите.',
  },
  sr: {
    title: 'Ugovorni subjekat',
    contractingCompany: 'Ugovorna kompanija',
    governingLaw: 'Merodavno pravo',
    unavailableTitle: 'Ugovorni subjekat nije dostupan',
    unavailableBody:
      'Trenutno ne možemo da prikažemo ugovornu kompaniju i merodavno pravo. Kontaktirajte podršku pre nastavka.',
  },
};

function entityLabelsFor(locale: string): EntityDisclosureNoticeLabels {
  const localePrefix = locale.toLowerCase().split('-')[0] ?? 'en';

  return ENTITY_LABELS[localePrefix] ?? ENTITY_LABELS.en;
}

export function SuccessFeeCalculatorSurface({
  entity = null,
  locale,
  registerEntry = false,
  surface,
  t,
}: SuccessFeeCalculatorSurfaceProps) {
  return (
    <div
      className="mt-16"
      data-testid={registerEntry ? 'register-success-fee-calculator' : undefined}
    >
      <SuccessFeeCalculator
        {...buildSuccessFeeCalculatorProps(t, SURFACE_TEST_IDS[surface], locale, {
          entityDisclosure: entity,
          entityDisclosureLabels: entityLabelsFor(locale),
        })}
      />
    </div>
  );
}
