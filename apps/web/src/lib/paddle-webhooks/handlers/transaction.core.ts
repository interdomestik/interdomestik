export async function handleTransactionCompleted(params: { data: unknown }) {
  const tx = params.data as
    | {
        customData?: { userId?: string };
        custom_data?: { userId?: string };
        subscriptionId?: string | null;
        subscription_id?: string | null;
      }
    | undefined;

  const customData = (tx?.customData || tx?.custom_data) as { userId?: string } | undefined;
  const userId = customData?.userId;
  const subscriptionId = tx?.subscriptionId || tx?.subscription_id;

  if (userId && subscriptionId) {
    console.log(`[Webhook] Transaction completed for sub ${subscriptionId}, user ${userId}`);
  }
}
