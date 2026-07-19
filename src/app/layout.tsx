import type { Metadata, Viewport } from "next";
import { Geist, Inter } from "next/font/google";
import "./globals.css";
import { AppChrome } from "@/components/AppChrome";
import { ThemeProvider } from "@/components/ThemeProvider";
import { APPEARANCE_STORAGE_KEY } from "@/lib/appearance-settings";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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

// Light is the default and the app never follows the OS scheme: apply dark
// only when the stored preference is explicitly "dark"; anything else (no
// preference, a legacy "system" value, or an error) stays light.
const themeInitScript = `(function(){try{var k=${JSON.stringify(APPEARANCE_STORAGE_KEY)};var s=localStorage.getItem(k);document.documentElement.classList.toggle("dark",s==="dark");}catch(e){document.documentElement.classList.toggle("dark",false);}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${inter.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        suppressHydrationWarning
        className="antialiased font-sans min-h-screen bg-background text-foreground"
      >
        <ThemeProvider>
          <AppChrome>{children}</AppChrome>
        </ThemeProvider>
      </body>
    </html>
  );
}
