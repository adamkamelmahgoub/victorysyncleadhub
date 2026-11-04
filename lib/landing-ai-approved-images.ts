export function approvedAiImageUrls(context: Record<string, unknown>, supabaseUrl: string): string[] {
  const base = supabaseUrl.replace(/\/$/, '');
  const photos = (Array.isArray(context.photos) ? context.photos : [])
    .filter((value): value is string => typeof value === 'string' &&
      /^landing-media\/[a-f0-9-]{36}\/[a-zA-Z0-9_./-]+$/.test(value) &&
      value.split('/').every(part => part !== '.' && part !== '..'))
    .map(value => `${base}/storage/v1/object/public/${value}`);
  return [...photos, ...(typeof context.logoUrl === 'string' && context.logoUrl ? [context.logoUrl] : [])];
}
