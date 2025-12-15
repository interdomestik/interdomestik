export const flags = {
  flightDelay: process.env.NEXT_PUBLIC_ENABLE_FLIGHT_DELAY === 'true',
  callMeNow: process.env.NEXT_PUBLIC_ENABLE_CALL_ME_NOW === 'true',
  responseSla: process.env.NEXT_PUBLIC_ENABLE_RESPONSE_SLA === 'true',
};
