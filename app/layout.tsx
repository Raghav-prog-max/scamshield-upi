import type { Metadata } from "next";
import { Geist, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Hindi (Devanagari) messages and replies render with a proper font.
const devanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari",
  subsets: ["devanagari"],
});

export const metadata: Metadata = {
  title: "ScamShield UPI — check a suspicious message",
  description:
    "Paste a suspicious SMS, WhatsApp or email (English, Hindi or Hinglish) and find out if it is a UPI, KYC or banking scam.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${devanagari.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
