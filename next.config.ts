import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-src 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["exceljs", "pdf-lib", "nodemailer", "bcryptjs"],
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  async headers() {
    return [
      // Everything except the private file endpoint: never frameable
      { source: "/((?!api/v1/files).*)", headers: securityHeaders },
      // Receipts may be previewed in a same-origin iframe
      { source: "/api/v1/files", headers: securityHeaders.map((h) => (h.key === "X-Frame-Options" ? { ...h, value: "SAMEORIGIN" } : h.key === "Content-Security-Policy" ? { ...h, value: "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'" } : h)) },
    ];
  },
};

export default nextConfig;
