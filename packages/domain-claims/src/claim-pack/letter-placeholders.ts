import type { IntakeAnswers } from './types';

/** Placeholder markers for information the member fills in manually. */
export const PH = {
  senderName: '[YOUR_FULL_NAME]',
  senderAddress: '[YOUR_ADDRESS]',
  recipientName: '[RECIPIENT_NAME]',
  recipientAddress: '[RECIPIENT_ADDRESS]',
  date: '[DATE]',
  referenceNumber: '[REFERENCE_NUMBER]',
  responseDeadline: '[RESPONSE_DEADLINE]',
  claimedAmount: '[CLAIMED_AMOUNT]',
} as const;

export type LetterData = {
  subject: string;
  body: string;
};

export function formatClaimedAmount(answers: IntakeAnswers): string {
  return answers.estimatedAmount
    ? `${(answers.estimatedAmount / 100).toFixed(2)} ${answers.currency || 'EUR'}`
    : PH.claimedAmount;
}
