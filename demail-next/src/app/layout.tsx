import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Demail",
  description: "Open source cold email outreach on Supabase, Resend and Vercel.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased">{children}</body>
    </html>
  );
}
