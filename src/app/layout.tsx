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
      <head>
        <link rel="icon" href="/favicons/cashcatfavicon16.ico" sizes="16x16" />
        <link rel="icon" href="/favicons/cashcatfavicon32.ico" sizes="32x32" />
        <link rel="icon" href="/favicons/cashcatfavicon64.ico" sizes="64x64" />
        <link rel="icon" href="/favicons/cashcatfavicon128.ico" sizes="128x128" />
        <link rel="icon" href="/favicons/cashcatfavicon256.ico" sizes="256x256" />
        <link rel="apple-touch-icon" href="/favicons/cashcatpwa512.png" />
        <meta name="theme-color" content="#0a0a0a" />
      </head>
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
