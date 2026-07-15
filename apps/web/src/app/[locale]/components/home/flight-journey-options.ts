export const FLIGHT_TRAVEL_STATES = ['yes', 'no', 'unsure'] as const;
export const FLIGHT_DISRUPTIONS = [
  'delay',
  'cancellation',
  'denied',
  'connection',
  'baggage',
  'assistance',
  'other',
] as const;
export const FLIGHT_CONDITIONAL_ANSWERS = ['yes', 'no', 'unsure'] as const;

export type FlightTravelState = (typeof FLIGHT_TRAVEL_STATES)[number];
export type FlightDisruption = (typeof FLIGHT_DISRUPTIONS)[number];
export type FlightConditionalAnswer = (typeof FLIGHT_CONDITIONAL_ANSWERS)[number];
export type FlightStage =
  'travelState' | 'disruption' | 'connection' | 'baggage' | 'notice' | 'result';

export function getFlightJourneyOptions(t: (key: string) => string) {
  return {
    answers: FLIGHT_CONDITIONAL_ANSWERS.map(id => ({ id, label: t(`answers.${id}`) })),
    disruptions: FLIGHT_DISRUPTIONS.map(id => ({ id, label: t(`disruption.${id}`) })),
  };
}

export function getConditionalStage(disruption: FlightDisruption): FlightStage {
  if (disruption === 'connection') return 'connection';
  if (disruption === 'baggage') return 'baggage';
  if (disruption === 'assistance') return 'result';
  return 'notice';
}

export function getConditionalKey(
  disruption: FlightDisruption,
  answer: FlightConditionalAnswer
): string | null {
  if (disruption === 'connection') return `connection_${answer}`;
  if (disruption === 'baggage') return `baggage_${answer}`;
  if (disruption === 'assistance') return null;
  return `notice_${answer}`;
}
