type DeliveryEnvironment = Partial<Pick<NodeJS.ProcessEnv, 'VERCEL_ENV' | 'CLIENT_DELIVERY_SANDBOX'>>;

export function externalSendsEnabled(env: DeliveryEnvironment = process.env): boolean {
  return env.VERCEL_ENV === 'production' && env.CLIENT_DELIVERY_SANDBOX !== '1';
}

export function requireExternalSends(env: DeliveryEnvironment = process.env): void {
  if (!externalSendsEnabled(env)) throw new Error('External delivery is disabled outside production or in sandbox mode');
}
