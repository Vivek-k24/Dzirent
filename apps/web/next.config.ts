import type { NextConfig } from 'next';

// P5A security headers. The site loads only its own files, the Supabase project (API, Storage
// photos, Realtime chat over wss) and, on Vercel preview deployments, the Vercel toolbar.
const supabase = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin;
  } catch {
    return 'https://*.supabase.co';
  }
})();
const supabaseSocket = supabase.replace(/^https:/, 'wss:');
const dev = process.env.NODE_ENV !== 'production';
// The toolbar Vercel adds to preview deployments (comments, feedback).
const vercelToolbar = process.env.VERCEL_ENV === 'preview';
const live = vercelToolbar ? ['https://vercel.live'] : [];

const csp = [
  "default-src 'self'",
  // Next.js streams the page with inline scripts; 'unsafe-eval' only for `next dev`.
  ["script-src 'self' 'unsafe-inline'", dev ? "'unsafe-eval'" : '', ...live].filter(Boolean).join(' '),
  ["style-src 'self' 'unsafe-inline'", ...live].join(' '),
  // Listing photos (Storage), photo previews before upload (blob:), the admin TOTP QR code (data:).
  ["img-src 'self' blob: data:", supabase, ...(vercelToolbar ? ['https://vercel.live', 'https://vercel.com'] : [])].join(' '),
  ["font-src 'self'", ...(vercelToolbar ? ['https://vercel.live', 'https://assets.vercel.com'] : [])].join(' '),
  ["connect-src 'self'", supabase, supabaseSocket, ...(vercelToolbar ? ['https://vercel.live', 'wss://ws-us3.pusher.com'] : []), dev ? 'ws:' : '']
    .filter(Boolean).join(' '),
  "media-src 'self' blob:",
  ["frame-src", ...(vercelToolbar ? ['https://vercel.live'] : ["'none'"])].join(' '),
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  dev ? '' : 'upgrade-insecure-requests',
].filter(Boolean).join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Camera (listing photos) and location (distance) only for Dzirent itself; everything else off.
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), display-capture=()',
  },
];

const config: NextConfig = {
  images: { unoptimized: true },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
export default config;
