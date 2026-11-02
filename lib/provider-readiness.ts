type ProviderEnvironment = Partial<Record<
  'VERCEL_ENV' | 'CLIENT_DELIVERY_SANDBOX' | 'STRIPE_SECRET_KEY' | 'STRIPE_WEBHOOK_SECRET' |
  'MIGHTYCALL_API_KEY' | 'MIGHTYCALL_SECRET_KEY' | 'MIGHTYCALL_USER_KEY' |
  'MIGHTYCALL_WEBHOOK_SECRET' | 'RESEND_API_KEY' | 'INVITE_FROM_EMAIL' |
  'REPORT_FROM_EMAIL' | 'SLACK_WEBHOOK_URL' | 'PORTAL_BASE_URL' |
  'PUBLIC_PAGES_BASE_URL' | 'CLIENT_DELIVERY_WORKER_SECRET', string>>;

const configured = (value: string | undefined) => Boolean(value?.trim());
const httpsOrigin = (value: string | undefined) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value.replace(/\/$/, '') && Boolean(url.hostname);
  } catch { return false; }
};

export function providerReadiness(env: ProviderEnvironment) {
  return {
    sandbox: env.VERCEL_ENV !== 'production' || env.CLIENT_DELIVERY_SANDBOX === '1',
    stripe: configured(env.STRIPE_SECRET_KEY) && configured(env.STRIPE_WEBHOOK_SECRET),
    mightycall: configured(env.MIGHTYCALL_API_KEY) &&
      (configured(env.MIGHTYCALL_SECRET_KEY) || configured(env.MIGHTYCALL_USER_KEY)) &&
      configured(env.MIGHTYCALL_WEBHOOK_SECRET),
    invites: configured(env.RESEND_API_KEY) && configured(env.INVITE_FROM_EMAIL),
    reports: configured(env.RESEND_API_KEY) && configured(env.REPORT_FROM_EMAIL),
    slack: configured(env.SLACK_WEBHOOK_URL),
    portalUrl: httpsOrigin(env.PORTAL_BASE_URL),
    publicPagesUrl: httpsOrigin(env.PUBLIC_PAGES_BASE_URL),
    worker: configured(env.CLIENT_DELIVERY_WORKER_SECRET),
  };
}
