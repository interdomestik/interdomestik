import type { FeeMathSheetCopy } from './fee-math-sheet-copy';

export const SR_FEE_MATH_SHEET_COPY: FeeMathSheetCopy = {
  eyebrow: 'Tretman sudskih troškova',
  title: 'Sudski troškovi se dogovaraju pisanim putem pre sudskog postupka',
  body: 'Ako nema naplate, nema success fee za Interdomestik. Spoljni sudski troškovi se ne obećavaju kao uvek nula; kontroliše ih pisani dogovor pre nego što trošak nastane.',
  treatmentLabel: 'Potreban je pisani dogovor',
  rows: [
    {
      key: 'fees.lossPromise',
      label: 'Bez success fee kada nema naplate',
      body: 'Ako nema naplate, nema success fee za Interdomestik.',
    },
    {
      key: 'fees.courtPathCosts',
      label: 'Sudski postupak se prethodno otkriva',
      body: 'Troškovi sudskog postupka moraju biti otkriveni pisanim putem pre nego što predmet uđe u sud.',
    },
    {
      key: 'fees.thirdPartyCosts',
      label: 'Troškovi trećih strana mogu ostati odvojeni',
      body: 'Fiksne sudske takse, takse za odluku i super-veštačenja mogu ostati odgovornost klijenta ako su dogovoreni pisanim putem.',
    },
    {
      key: 'fees.reimbursement',
      label: 'Naknada priznata od suda',
      body: 'Naknada za troškove koje je Interdomestik platio unapred vraća se Interdomestiku kada je priznata sudskom odlukom.',
    },
  ],
};
