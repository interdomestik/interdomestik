const LOCALIZED_BRANCH_NAMES: Record<string, Partial<Record<string, string>>> = {
  'MK Branch A (Main)': {
    mk: 'Филијала MK A (Главна)',
    sq: 'Dega MK A (Kryesore)',
    sr: 'Filijala MK A (Glavna)',
    de: 'Filiale MK A (Hauptsitz)',
  },
  'KS Branch A (Prishtina)': {
    mk: 'Филијала KS A (Приштина)',
    sq: 'Dega KS A (Prishtinë)',
    sr: 'Filijala KS A (Priština)',
    de: 'Filiale KS A (Prishtina)',
  },
};

export function localizeSeededBranchName(name: string | null | undefined, locale: string): string {
  if (!name) return '';

  return LOCALIZED_BRANCH_NAMES[name]?.[locale] ?? name;
}
