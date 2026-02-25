import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

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
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body className="antialiased font-sans min-h-screen bg-sand-beige">
        <Sidebar />
        <div className="lg:pl-64 min-h-screen pt-16 pl-14 lg:pt-0 lg:pl-0">
          {children}
        </div>

        <div className="fixed bottom-0 right-0 pointer-events-none opacity-10 translate-x-1/4 translate-y-1/4">
          <svg
            width="400"
            height="400"
            viewBox="0 0 24 24"
            fill="#166534"
            aria-hidden="true"
          >
            <path d="M17,8C8,10 5.9,16.17 3.82,21.34L5.71,22L6.66,19.7C7.14,19.87 7.64,20 8,20C19,20 22,3 22,3C21,5 14,5.25 9,6.25C4,7.25 2,11.5 2,13.5C2,15.5 3.75,17.25 3.75,17.25C7,11 17,8 17,8Z" />
          </svg>
        </div>
      </body>
    </html>
  );
}
