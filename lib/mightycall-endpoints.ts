export type MightyCallProduct = 'classic' | 'call_center';

export function mightyCallProduct(value: string | undefined): MightyCallProduct {
  if (!value || value === 'classic') return 'classic';
  if (value === 'call_center') return value;
  throw new Error('MIGHTYCALL_PRODUCT must be classic or call_center');
}

export function mightyCallUrl(product: MightyCallProduct, path: string): string {
  if (!/^(?:calls\/[A-Za-z0-9-]+|messages\/send)$/.test(path))
    throw new Error('Unsupported MightyCall API path');
  const host = product === 'call_center' ? 'ccapi.mightycall.com' : 'api.mightycall.com';
  const endpoint = product === 'call_center' && path === 'messages/send'
    ? 'contactcenter/messages/send' : path;
  return `https://${host}/v4/api/${endpoint}`;
}

export function mightyCallAuthUrl(product: MightyCallProduct): string {
  const host = product === 'call_center' ? 'ccapi.mightycall.com' : 'api.mightycall.com';
  return `https://${host}/v4/auth/token`;
}
