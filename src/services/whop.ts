export type WhopCheckoutResult = {
  checkoutId: string;
  checkoutUrl: string | null;
  mode: "live" | "fallback";
};

export function buildCheckoutUrl(purchaseUrl: string | null): string | null {
  return purchaseUrl;
}

export function buildEmbeddedChatUrl(_channelId: string): null {
  return null;
}
