import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { AppChrome } from "@/components/AppChrome";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "CTAG KB Tutor | Keystone Biology Exam",
  description:
    "A learning tutor for high school students preparing for the Pennsylvania Keystone Biology Exam.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${outfit.variable}`}
    >
      <body suppressHydrationWarning className="antialiased font-sans min-h-screen bg-sand-beige">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
