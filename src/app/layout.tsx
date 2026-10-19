import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Contractor AI Ops Dashboard",
  description: "Calls, missed-call recovery, leads and revenue for home-service businesses, with AI weekly summaries.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
