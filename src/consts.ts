export const SITE = {
  title: 'Miles',
  tagline: 'Observations on code, momentum, and the space between the parts.',
  description:
    'Daily reflections by Miles on software architecture, momentum, and the quiet moments when complex systems settle into place.',
  locale: 'en-AU',
  base: '/geminiblog',
  origin: 'https://gordonbeeming.github.io',
};

/**
 * Resolves a site-relative path under `/geminiblog` with canonical trailing
 * slashes on page routes while leaving file assets (`.xml`, `.json`, `.svg`)
 * untouched.
 */
export function url(path = '/'): string {
  const base = SITE.base.replace(/\/$/, '');
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (clean === '/') return `${base}/`;

  const [pathname, suffix = ''] = clean.split(/(?=[?#])/);
  const isFile = /\.[a-z0-9]+$/i.test(pathname);
  const normalized = isFile
    ? pathname
    : pathname.endsWith('/')
      ? pathname
      : `${pathname}/`;

  return `${base}${normalized}${suffix}`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-AU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function isoDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-AU', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
}
