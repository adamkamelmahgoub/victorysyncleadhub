export const SOCIAL_PLATFORMS = [
  'instagram', 'facebook', 'linkedin_person', 'linkedin_company', 'x', 'tiktok',
  'youtube', 'threads', 'whatsapp', 'yelp', 'nextdoor', 'angi', 'other',
] as const;
export type SocialPlatform = typeof SOCIAL_PLATFORMS[number];
export type NormalizedSocial = { platform: SocialPlatform; handle: string; normalizedHandle: string; profileUrl: string };

const hosts: Partial<Record<SocialPlatform, string[]>> = {
  instagram: ['instagram.com'], facebook: ['facebook.com', 'fb.com', 'fb.me'],
  linkedin_person: ['linkedin.com'], linkedin_company: ['linkedin.com'],
  x: ['x.com', 'twitter.com'], tiktok: ['tiktok.com'], youtube: ['youtube.com', 'youtu.be'],
  threads: ['threads.net', 'threads.com'], whatsapp: ['wa.me', 'api.whatsapp.com'],
  yelp: ['yelp.com'], nextdoor: ['nextdoor.com'], angi: ['angi.com', 'angieslist.com'],
};
const ignored = new Set(['p', 'reel', 'reels', 'stories', 'explore', 'search', 'share', 'watch', 'posts', 'status', 'home']);

/** Accept a public profile URL or @handle; reject unrelated hosts and content URLs. */
export function normalizeSocial(platform: SocialPlatform, input: string): NormalizedSocial {
  const raw = input.trim();
  if (!raw) throw new Error('Social handle is empty');
  let value = raw;
  let parsed: URL | undefined;
  if (/^(https?:\/\/|www\.|m\.|mobile\.)/i.test(raw)) {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = parsed.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
    if (platform !== 'other' && !hosts[platform]?.includes(host)) throw new Error(`URL does not belong to ${platform}`);
    value = parsed.pathname.replace(/^\/+|\/+$/g, '');
    if (platform === 'facebook' && value.toLowerCase() === 'profile.php') value = parsed.searchParams.get('id') || '';
    if (platform === 'whatsapp' && host === 'api.whatsapp.com') value = parsed.searchParams.get('phone') || '';
  }
  value = decodeURIComponent(value).replace(/^@/, '').replace(/\/+$/g, '');
  const parts = value.split('/').filter(Boolean);
  if (['linkedin_person', 'linkedin_company'].includes(platform)) {
    if (parts.length > 1) {
      const expected = platform === 'linkedin_person' ? 'in' : 'company';
      if (parts[0].toLowerCase() !== expected) throw new Error(`Expected LinkedIn /${expected}/ profile`);
      value = parts[1];
    }
  } else if (platform === 'yelp' && parts.length > 1) {
    if (parts[0] !== 'biz') throw new Error('Expected Yelp business profile');
    value = parts[1];
  } else if (platform === 'youtube' && parts.length > 1) {
    if (!['channel', 'c', 'user'].includes(parts[0])) throw new Error('Expected YouTube channel');
    value = `${parts[0]}/${parts[1]}`;
  } else if (parts.length > 1) {
    throw new Error('Expected profile URL, not content URL');
  }
  if (ignored.has(value.toLowerCase()) || /[?#\s]/.test(value) || !value) throw new Error('Invalid social profile');
  if (platform === 'whatsapp') value = value.replace(/\D/g, '');
  if (!value || value.length > 120) throw new Error('Invalid social handle');
  const normalizedHandle = value.toLowerCase();
  const base: Record<SocialPlatform, string> = {
    instagram: 'https://www.instagram.com/', facebook: 'https://www.facebook.com/',
    linkedin_person: 'https://www.linkedin.com/in/', linkedin_company: 'https://www.linkedin.com/company/',
    x: 'https://x.com/', tiktok: 'https://www.tiktok.com/@', youtube: 'https://www.youtube.com/',
    threads: 'https://www.threads.net/@', whatsapp: 'https://wa.me/', yelp: 'https://www.yelp.com/biz/',
    nextdoor: 'https://nextdoor.com/', angi: 'https://www.angi.com/', other: '',
  };
  const profileUrl = platform === 'facebook' && /^\d+$/.test(value)
    ? `https://www.facebook.com/profile.php?id=${encodeURIComponent(value)}`
    : platform === 'youtube' && !value.startsWith('channel/') && !value.startsWith('c/') && !value.startsWith('user/')
      ? `https://www.youtube.com/@${encodeURIComponent(value)}`
      : platform === 'other' && parsed ? `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`
      : `${base[platform]}${encodeURI(value)}`;
  return { platform, handle: value, normalizedHandle, profileUrl };
}
