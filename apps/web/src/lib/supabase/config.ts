export function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.');
  return {url, key};
}
export function photoUrl(path: string | null | undefined) {
  if (!path) return null;
  const base = config().url.replace(/\/$/, '');
  if (path.startsWith('https://')) {
    const parsed = new URL(path);
    return parsed.origin === new URL(base).origin && parsed.pathname.startsWith('/storage/v1/object/public/listing-photos/') ? path : null;
  }
  return base + '/storage/v1/object/public/listing-photos/' + path.split('/').map(encodeURIComponent).join('/');
}
