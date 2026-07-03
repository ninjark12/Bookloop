import type { NextConfig } from "next";

const securityHeaders = [
  // ── CSP ────────────────────────────────────────────────────────────────────
  // 'unsafe-inline' on script-src is required by next-themes (flash-prevention
  // script runs before hydration) and Next.js's own __NEXT_DATA__ inline tag.
  // React never renders user content as raw HTML, so inline XSS is not a
  // realistic vector here. All cross-origin script execution is still blocked.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      // Book covers are proxied through /_next/image (same origin), so only 'self' is needed
      "img-src 'self' data:",
      // next/font downloads fonts at build time and serves them from self
      "font-src 'self'",
      // Vercel Analytics beacon
      "connect-src 'self' https://vitals.vercel-insights.com https://va.vercel-scripts.com",
      "frame-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
    ].join("; "),
  },
  // ── Framing / MIME / referrer ───────────────────────────────────────────────
  { key: "X-Frame-Options",        value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy",        value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",     value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "covers.openlibrary.org" },
      { protocol: "https", hostname: "books.google.com" },
      { protocol: "http",  hostname: "books.google.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
