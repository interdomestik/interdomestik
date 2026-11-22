import type { ClaimMailCopy } from './types';

const viewClaim = 'Погледнете го барањето';
const footer = 'Тимот на Интердоместик';

export const MK_COPY: ClaimMailCopy = {
  statuses: {
    draft: 'Нацрт',
    submitted: 'Поднесено',
    submitted_to_airline: 'Поднесено до авиокомпанијата',
    verification: 'Верификација',
    evaluation: 'Проценка',
    negotiation: 'Преговори',
    court: 'Суд',
    resolved: 'Решено',
    rejected: 'Одбиено',
  },
  categories: {
    consumer: 'Потрошувач',
    consumer_rights: 'Потрошувачки права',
    housing: 'Домување',
    insurance: 'Осигурување',
    employment: 'Вработување',
    contracts: 'Договори',
    utilities: 'Комуналии',
    auto: 'Возило',
    vehicle: 'Возило',
    travel: 'Патување',
    retail: 'Малопродажба',
    real_estate: 'Недвижнини',
    property: 'Имот',
    flight_delay: 'Доцнење на лет',
    damaged_goods: 'Оштетена стока',
    service_issue: 'Проблем со услуга',
    liability: 'Одговорност',
    medical: 'Медицински',
    test: 'Тест',
    other: 'Друго',
    injury: 'Лична повреда',
  },
  genericCategory: 'Друго',
  messages: {
    claim_submitted: {
      subject: 'Го примивме вашето барање',
      heading: 'Го примивме вашето барање',
      body: 'Вашето барање „{title}“ е успешно поднесено.\nКатегорија: {category}\nИД на барањето: {claimId}',
      cta: viewClaim,
      footer,
    },
    claim_status_changed: {
      subject: 'Новиот статус на барањето е {toStatus}',
      heading: 'Новиот статус на барањето е {toStatus}',
      body: 'Статусот на вашето барање „{title}“ е променет од {fromStatus} во {toStatus}.\nИД на барањето: {claimId}',
      cta: viewClaim,
      footer,
    },
    claim_recovery_decision: {
      accepted: {
        subject: 'Прифатена е постапка за наплата',
        heading: 'Прифатена е постапка за наплата',
        body: 'Тимот го прифати барањето „{title}“ за постапка за наплата.',
        cta: viewClaim,
        footer,
      },
      declined: {
        subject: 'Одбиена е постапка за наплата',
        heading: 'Одбиена е постапка за наплата',
        body: 'Тимот одби да поведе постапка за наплата за барањето „{title}“.',
        cta: viewClaim,
        footer,
      },
    },
    claim_message_to_member: {
      full: {
        subject: 'Нова порака за вашето барање',
        heading: 'Нова порака за вашето барање',
        body: '{sender} испрати порака за барањето „{title}“.\n{excerpt}\nИД на барањето: {claimId}',
        cta: 'Одговорете сега',
        footer,
      },
      restricted: {
        subject: 'Нова порака',
        heading: 'Нова порака',
        body: 'Достапно е ажурирање. Содржината на пораките и белешките е ограничена за раководителите на филијали.',
        cta: 'Отворете го Интердоместик',
        footer,
      },
    },
    staff_claim_submitted: {
      subject: 'Поднесено е ново барање',
      heading: 'Поднесено е ново барање',
      body: 'Број на барањето: {claimNumber}\nКатегорија: {category}',
      cta: viewClaim,
      footer,
    },
    staff_member_message: {
      subject: 'Нова порака од член',
      heading: 'Нова порака од член',
      body: 'Број на барањето: {claimNumber}\nКатегорија: {category}',
      cta: viewClaim,
      footer,
    },
  },
};
