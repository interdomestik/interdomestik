export async function resendWelcomeEmailCore(_userId: string) {
  return {
    success: false,
    error:
      'Provider-backed membership confirmations cannot be resent until an immutable confirmation snapshot is stored.',
  };
}
