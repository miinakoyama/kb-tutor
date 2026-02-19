import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

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
    <html lang="en">
      <body className="antialiased font-sans min-h-screen bg-sand-beige">
        <Sidebar />
        <div className="lg:pl-64 min-h-screen pt-16 pl-14 lg:pt-0 lg:pl-0">
          {children}
        </div>
      </body>
    </html>
  );
}
