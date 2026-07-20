import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StoreBridge",
  description: "WooCommerce to Shopify migration platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
