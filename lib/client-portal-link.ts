function validOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function clientPortalLink(path: 'leads' | 'calls', portalBase?: string, appBase?: string): string {
  const origin = validOrigin(portalBase) || validOrigin(appBase) || 'https://app.victorysync.com';
  return `${origin}/client-portal/${path}`;
}
