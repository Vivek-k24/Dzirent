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

// C5: Stripe's domains, only on the pay page (/app/pay/<rental>), the one page that loads Stripe.js
// for the Payment Element (Stripe's documented CSP: the script, its frames and 3-D Secure frames,
// its API, its images). Every other page keeps the stricter policy. security-log.md, "Payments
// screens (C5)".
const stripe = {
  script: ['https://js.stripe.com', 'https://*.js.stripe.com'],
  frame: ['https://js.stripe.com', 'https://*.js.stripe.com', 'https://hooks.stripe.com'],
  connect: ['https://api.stripe.com'],
  img: ['https://*.stripe.com'],
};

function policy(pay: boolean) {
  return [
    "default-src 'self'",
    // Next.js streams the page with inline scripts; 'unsafe-eval' only for `next dev`.
    ["script-src 'self' 'unsafe-inline'", dev ? "'unsafe-eval'" : '', ...live, ...(pay ? stripe.script : [])].filter(Boolean).join(' '),
    ["style-src 'self' 'unsafe-inline'", ...live].join(' '),
    // Listing photos (Storage), photo previews before upload (blob:), the admin TOTP QR code (data:).
    ["img-src 'self' blob: data:", supabase, ...(vercelToolbar ? ['https://vercel.live', 'https://vercel.com'] : []), ...(pay ? stripe.img : [])].join(' '),
    ["font-src 'self'", ...(vercelToolbar ? ['https://vercel.live', 'https://assets.vercel.com'] : [])].join(' '),
    ["connect-src 'self'", supabase, supabaseSocket, ...(vercelToolbar ? ['https://vercel.live', 'wss://ws-us3.pusher.com'] : []), ...(pay ? stripe.connect : []), dev ? 'ws:' : '']
      .filter(Boolean).join(' '),
    "media-src 'self' blob:",
    pay
      ? ['frame-src', ...stripe.frame, ...(vercelToolbar ? ['https://vercel.live'] : [])].join(' ')
      : ['frame-src', ...(vercelToolbar ? ['https://vercel.live'] : ["'none'"])].join(' '),
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    dev ? '' : 'upgrade-insecure-requests',
  ].filter(Boolean).join('; ');
}
const csp = policy(false);
const payCsp = policy(true);

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
    return [
      { source: '/:path*', headers: securityHeaders },
      // C5: the pay page's policy replaces the site's (the later rule wins for the same header).
      { source: '/app/pay/:path*', headers: [{ key: 'Content-Security-Policy', value: payCsp }] },
    ];
  },
};
export default config;
