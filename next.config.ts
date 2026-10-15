import type { NextConfig } from "next";

/**
 * Security headers — applied to every route (pages AND /api/*).
 *
 * CSP notes (documented per the issue):
 *   - script-src 'unsafe-inline' — Next.js SSR injects hydration
 *     payloads (`self.__next_f`) and the theme-boot script inline;
 *     there is no nonce surface in static prerender, so inline is
 *     required for the app to boot. The blast radius is still bounded:
 *     script-src 'self' excludes every external origin.
 *   - style-src 'unsafe-inline' — Tailwind emits inline styles.
 *   - font-src 'self' — fonts are self-hosted woff2 in /public/fonts.
 *   - img-src 'self' data: blob: — wallet QR codes render as data URIs.
 *   - connect/form-action — Google OAuth endpoints only.
 *   - frame-ancestors 'none' + X-Frame-Options DENY — the app ships no
 *     iframes; clickjacking the sign-in flow is closed both ways.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
