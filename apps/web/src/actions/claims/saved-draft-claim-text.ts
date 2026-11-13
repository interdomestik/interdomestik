import { getLocale, getTranslations } from 'next-intl/server';

import { formatPilotDate } from '@/lib/utils/date';

type Translate = { (key: string): string; has(key: string): boolean };

export type SavedDraftClaimFacts = Readonly<{
  category: string;
  issueType: string;
  incidentDate: string;
  counterparty: string;
  desiredOutcome: string;
  summary: string;
}>;

/** English option names, used only when the request locale's catalog lacks an entry. */
export type SavedDraftEnglishOptions = Readonly<{
  category: string;
  issue: string;
  outcome: string;
}>;

const FIELD_LABELS = [
  ['categoryLabel', 'Category'],
  ['issueLabel', 'Issue'],
  ['dateLabel', 'Incident date'],
  ['counterpartyLabel', 'Counterparty'],
  ['outcomeLabel', 'Desired outcome'],
  ['summaryLabel', 'Summary'],
] as const;

/**
 * Builds the stored claim title and description in the member's request locale, reusing the Free
 * Start option and preview labels the member saw while filling in the draft.
 */
export async function buildSavedDraftClaimText(
  facts: SavedDraftClaimFacts,
  english: SavedDraftEnglishOptions
): Promise<{ title: string; description: string }> {
  const locale = await getLocale();
  const t = (await getTranslations({ locale, namespace: 'freeStart' })) as unknown as Translate;
  const pick = (key: string, fallback: string): string => (t.has(key) ? t(key) : fallback);
  const category = pick(`categories.${facts.category}.title`, english.category);
  const issue = pick(`issues.${facts.category}.${facts.issueType}`, english.issue);
  const values = [
    category,
    issue,
    formatPilotDate(facts.incidentDate, locale, facts.incidentDate),
    facts.counterparty,
    pick(`outcomes.${facts.desiredOutcome}`, english.outcome),
    facts.summary,
  ];
  const description = FIELD_LABELS.map(
    ([key, fallback], index) => `${pick(`preview.${key}`, fallback)}: ${values[index]}`
  ).join('\n');
  return { title: `${category}: ${issue}`, description };
}
