import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { Gabarito } from "next/font/google";
import SupabaseProvider from './contexts/supabase-provider';
import "./globals.css";

const USEFont = Gabarito({
  variable: "--font-suse",
  weight: "variable",
  subsets: ["latin"],
});


export const metadata: Metadata = {
  title: "CashCat",
  description: "Manage your budget with zero-based budgeting",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">

      <meta name="theme-color" content="#0a0a0a" />
      <body
        className={`${USEFont.variable} antialiased`}
      >
        <SpeedInsights/>
        <Analytics/>
        <SupabaseProvider>
          {children}
        </SupabaseProvider>
      </body>
    </html>
  );
}
