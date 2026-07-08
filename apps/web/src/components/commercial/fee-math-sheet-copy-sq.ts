import type { FeeMathSheetCopy } from './fee-math-sheet-copy';

export const SQ_FEE_MATH_SHEET_COPY: FeeMathSheetCopy = {
  eyebrow: 'Shpenzimet në rrugë gjyqësore',
  title: 'Shpenzimet gjyqësore dakordohen me shkrim para rrugës gjyqësore',
  body: 'Nëse nuk ka rikuperim, nuk ka success fee për Interdomestik. Shpenzimet e jashtme të rrugës gjyqësore nuk premtohen si gjithmonë zero; ato kontrollohen nga marrëveshja me shkrim para se kostoja të krijohet.',
  treatmentLabel: 'Kërkohet marrëveshje me shkrim',
  rows: [
    {
      key: 'fees.lossPromise',
      label: 'Pa success fee kur nuk ka rikuperim',
      body: 'Nëse nuk ka rikuperim, nuk ka success fee për Interdomestik.',
    },
    {
      key: 'fees.courtPathCosts',
      label: 'Rruga gjyqësore shpaloset paraprakisht',
      body: 'Kostot e rrugës gjyqësore duhet të shpalosen me shkrim para se rasti të hyjë në gjykatë.',
    },
    {
      key: 'fees.thirdPartyCosts',
      label: 'Kostot e treta mund të mbeten të ndara',
      body: 'Taksat fikse gjyqësore, tarifat për vendim dhe super-ekspertizat mund të mbeten përgjegjësi e klientit nëse dakordohen me shkrim.',
    },
    {
      key: 'fees.reimbursement',
      label: 'Rimbursimi i njohur nga gjykata',
      body: 'Rimbursimi i kostove që Interdomestik i ka paguar paraprakisht i kthehet Interdomestikut kur njihet nga vendimi gjyqësor.',
    },
  ],
};
