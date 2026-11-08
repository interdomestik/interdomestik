import type { SponsorMailContent, SponsorMailCopy } from './types';

export const MK_COPY: SponsorMailCopy = {
  greeting: 'Здраво',
  supportLabel: 'Контакт',
  messages: {
    sponsor_notice: (input): SponsorMailContent => ({
      subject: `${input.companyName} го плаќа вашето членство во Interdomestik`,
      paragraphs: [
        `${input.companyName} го плаќа членството за вас од ${input.startDate} до ${input.termEnd}.`,
        `${input.entityName}, правното лице во вашата земја, ги чува и контролира податоците што ни ги даде ${input.companyName} (име и адреса на е-пошта).`,
        `${input.companyName} гледа само дека сте регистрирани, никогаш вашите штети, документи, пораки или користење.`,
        'Сметката е ваша.',
        'За да го напуштите членството, користете го линкот подолу или изберете „Напушти“ на страницата за членство откако ќе се најавите.',
      ],
      links: [
        { label: 'Напушти го спонзорираното членство', url: input.optOutUrl },
        { label: 'Најавете се', url: input.loginUrl },
      ],
    }),
    handover_pending: (input): SponsorMailContent => ({
      subject: 'Преминот на вашето членство е во исчекување',
      paragraphs: [
        `Побаравме да се запре обновувањето на вашето индивидуално членство бидејќи ${input.companyName} сега ве спонзорира.`,
        'Вашето платено членство продолжува до крајот на тековниот период. Нема поврат на средства и ништо не губите. Спонзорираното членство започнува кога ќе заврши платеното.',
      ],
    }),
    handover_confirmed: (input): SponsorMailContent => ({
      subject: 'Обновувањето на вашето индивидуално членство е запрено',
      paragraphs: [
        `Вашето индивидуално обновување е запрено. Членството спонзорирано од ${input.companyName} започнува на ${input.startDate}.`,
      ],
    }),
    foreign_account: (input): SponsorMailContent => ({
      subject: 'Спонзорираното членство не можеше да се додаде',
      paragraphs: [
        `${input.companyName} ја наведе оваа адреса, но таа веќе припаѓа на сметка во Interdomestik во друга земја, па не можевме да го додадеме спонзорираното членство.`,
        `Контактирајте нè на ${input.supportEmail}.`,
      ],
    }),
    not_eligible: (input): SponsorMailContent => ({
      subject: 'Оваа сметка не може да има членство',
      paragraphs: [
        `${input.companyName} ја наведе оваа адреса, но таа припаѓа на сметка што не може да има членство.`,
        `Контактирајте нè на ${input.supportEmail}.`,
      ],
    }),
    renewal_notice: (input): SponsorMailContent => ({
      subject: 'Вашето спонзорство се ближи кон крајот',
      paragraphs: [
        `Спонзорството од ${input.companyName} завршува на ${input.termEnd}, освен ако ${input.companyName} не го обнови.`,
        'Ако заврши, ќе ви понудиме индивидуално членство.',
      ],
    }),
    membership_end_offer: (input): SponsorMailContent => ({
      subject: 'Вашето спонзорирано членство заврши',
      paragraphs: [
        'Вашето спонзорирано членство заврши. Можете да продолжите со индивидуално членство:',
      ],
      links: [{ label: 'Продолжете со индивидуално членство', url: input.offerUrl }],
    }),
    opt_out_confirmation: (input): SponsorMailContent => ({
      subject: 'Излеговте од спонзорираното членство',
      paragraphs: [
        `Излеговте од членството спонзорирано од ${input.companyName}.`,
        `Вашата сметка не е избришана. За да ја избришете, контактирајте нè на ${input.supportEmail}.`,
      ],
    }),
  },
};
