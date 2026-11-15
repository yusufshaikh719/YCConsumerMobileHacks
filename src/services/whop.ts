export type WhopCheckoutResult = {
  checkoutId: string;
  checkoutUrl: string | null;
  mode: "live" | "fallback";
};

export function buildCheckoutUrl(purchaseUrl: string | null): string | null {
  if (!purchaseUrl) return null;
  try {
    const url = new URL(purchaseUrl);
    if (url.username.length > 0 || url.password.length > 0 || url.port.length > 0) return null;
    if (url.protocol !== "https:" || (url.hostname !== "whop.com" && !url.hostname.endsWith(".whop.com"))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function buildEmbeddedChatUrl(channelId: string): string | null {
  const id = channelId.trim();
  if (!/^exp_[A-Za-z0-9]+$/.test(id)) return null;
  return `https://whop.com/experiences/${id}/`;
}
