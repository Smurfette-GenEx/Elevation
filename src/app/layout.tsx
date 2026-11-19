import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Atlas Expenses", template: "%s · Atlas Expenses" },
  description: "International expense management for multi-entity groups",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
