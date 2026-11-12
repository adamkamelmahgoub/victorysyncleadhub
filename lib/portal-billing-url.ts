export function portalBillingReturnUrl(baseUrl: string | undefined): string | null {
  if (!baseUrl) return null;
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== 'https:' || !base.hostname || base.username || base.password ||
      base.search || base.hash) return null;
    return new URL('/client-portal/billing', base).toString();
  } catch {
    return null;
  }
}
