import type { FeeMathSheetCopy } from './fee-math-sheet-copy';

export const MK_FEE_MATH_SHEET_COPY: FeeMathSheetCopy = {
  eyebrow: 'Третман на судски трошоци',
  title: 'Судските трошоци се договараат писмено пред судската постапка',
  body: 'Ако нема наплата, нема success fee за Interdomestik. Надворешните судски трошоци не се ветуваат како секогаш нула; тие се контролираат со писмениот договор пред да настане трошокот.',
  treatmentLabel: 'Потребен е писмен договор',
  rows: [
    {
      key: 'fees.lossPromise',
      label: 'Без success fee кога нема наплата',
      body: 'Ако нема наплата, нема success fee за Interdomestik.',
    },
    {
      key: 'fees.courtPathCosts',
      label: 'Судската постапка се открива однапред',
      body: 'Трошоците за судската постапка мора да се откријат писмено пред предметот да влезе во суд.',
    },
    {
      key: 'fees.thirdPartyCosts',
      label: 'Трошоците на трети страни може да останат одвоени',
      body: 'Фиксните судски такси, таксите за одлука и супер-вештачењата може да останат одговорност на клиентот ако се договорени писмено.',
    },
    {
      key: 'fees.reimbursement',
      label: 'Надомест признаен од суд',
      body: 'Надоместот за трошоци што Interdomestik ги платил однапред му се враќа на Interdomestik кога е признаен со судска одлука.',
    },
  ],
};
